package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/samplero/cert-signer/internal/issuer"
)

type issuerService interface {
	Issue(issuer.IssueRequest) (issuer.IssueResponse, error)
}

type Handler struct {
	service          issuerService
	authToken        string
	authSharedSecret string
	authMaxSkew      time.Duration
	nonceMu          sync.Mutex
	seenNonces       map[string]time.Time
}

func New(service issuerService, authToken, authSharedSecret string, authMaxSkew time.Duration) http.Handler {
	if authMaxSkew <= 0 {
		authMaxSkew = 60 * time.Second
	}
	h := &Handler{
		service:          service,
		authToken:        authToken,
		authSharedSecret: authSharedSecret,
		authMaxSkew:      authMaxSkew,
		seenNonces:       map[string]time.Time{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", h.healthz)
	mux.HandleFunc("/v1/certificates/issue", h.issue)
	return mux
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (h *Handler) issue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if !h.authorized(r, body) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	defer r.Body.Close()
	var req issuer.IssueRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(req.CSRPem) == "" || strings.TrimSpace(req.MachineID) == "" || strings.TrimSpace(req.KeyHash) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "csr_pem, machine_id, and key_hash are required"})
		return
	}
	resp, err := h.service.Issue(req)
	if err != nil {
		log.Printf("issue failed: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) authorized(r *http.Request, body []byte) bool {
	if !h.validBearer(r.Header.Get("Authorization")) {
		log.Printf("[Security] signer auth failed: invalid bearer token")
		return false
	}

	timestamp := strings.TrimSpace(r.Header.Get("x-signer-timestamp"))
	nonce := strings.TrimSpace(r.Header.Get("x-signer-nonce"))
	signature := normalizeHex(r.Header.Get("x-signer-signature"))
	if timestamp == "" || nonce == "" || signature == "" {
		log.Printf("[Security] signer auth failed: missing signed freshness headers")
		return false
	}

	requestTime, err := parseUnixTimestamp(timestamp)
	if err != nil {
		log.Printf("[Security] signer auth failed: invalid timestamp")
		return false
	}
	if delta := time.Since(requestTime); delta > h.authMaxSkew || delta < -h.authMaxSkew {
		log.Printf("[Security] signer auth failed: stale timestamp")
		return false
	}

	expected := h.computeSignature(timestamp, nonce, body)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		log.Printf("[Security] signer auth failed: invalid HMAC signature")
		return false
	}
	if !h.reserveNonce(nonce) {
		log.Printf("[Security] signer auth failed: replay detected for nonce %s", nonce)
		return false
	}

	return true
}

func (h *Handler) validBearer(auth string) bool {
	if auth == "" {
		return false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) {
		return false
	}
	provided := strings.TrimSpace(strings.TrimPrefix(auth, prefix))
	if provided == "" || h.authToken == "" {
		return false
	}
	return hmac.Equal([]byte(provided), []byte(h.authToken))
}

func (h *Handler) computeSignature(timestamp, nonce string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(h.authSharedSecret))
	_, _ = mac.Write([]byte(timestamp))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write([]byte(nonce))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func (h *Handler) reserveNonce(nonce string) bool {
	h.nonceMu.Lock()
	defer h.nonceMu.Unlock()

	now := time.Now().UTC()
	for key, expiresAt := range h.seenNonces {
		if !expiresAt.After(now) {
			delete(h.seenNonces, key)
		}
	}
	if _, exists := h.seenNonces[nonce]; exists {
		return false
	}

	ttl := h.authMaxSkew * 2
	if ttl < time.Minute {
		ttl = time.Minute
	}
	h.seenNonces[nonce] = now.Add(ttl)
	return true
}

func normalizeHex(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	return strings.TrimPrefix(trimmed, "sha256=")
}

func parseUnixTimestamp(value string) (time.Time, error) {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return time.Time{}, err
	}
	if parsed > 1_000_000_000_000 {
		parsed = parsed / 1000
	}
	return time.Unix(parsed, 0).UTC(), nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
