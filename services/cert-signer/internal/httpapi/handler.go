package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/samplero/cert-signer/internal/issuer"
)

type issuerService interface {
	Issue(issuer.IssueRequest) (issuer.IssueResponse, error)
}

type metricsTracker struct {
	startTime      time.Time
	requestsTotal  atomic.Uint64
	issuedTotal    atomic.Uint64
	failuresTotal  atomic.Uint64
	authFailsTotal atomic.Uint64
}

type Handler struct {
	service          issuerService
	authToken        string
	authSharedSecret string
	authMaxSkew      time.Duration
	nonceMu          sync.Mutex
	seenNonces       map[string]time.Time
	metrics          metricsTracker
	logger           *slog.Logger
}

func New(service issuerService, authToken, authSharedSecret string, authMaxSkew time.Duration) http.Handler {
	if authMaxSkew <= 0 {
		authMaxSkew = 60 * time.Second
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	h := &Handler{
		service:          service,
		authToken:        authToken,
		authSharedSecret: authSharedSecret,
		authMaxSkew:      authMaxSkew,
		seenNonces:       map[string]time.Time{},
		metrics: metricsTracker{
			startTime: time.Now().UTC(),
		},
		logger: logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", h.healthz)
	mux.HandleFunc("/readyz", h.readyz)
	mux.HandleFunc("/metrics", h.prometheusMetrics)
	mux.HandleFunc("/v1/certificates/issue", h.issue)
	return mux
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) readyz(w http.ResponseWriter, _ *http.Request) {
	if h.service == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "unhealthy",
			"error":  "issuer service not initialized",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ready",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) prometheusMetrics(w http.ResponseWriter, _ *http.Request) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	uptime := time.Since(h.metrics.startTime).Seconds()

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_, _ = fmt.Fprintf(w, "# HELP cert_signer_uptime_seconds Process uptime in seconds\n")
	_, _ = fmt.Fprintf(w, "# TYPE cert_signer_uptime_seconds gauge\n")
	_, _ = fmt.Fprintf(w, "cert_signer_uptime_seconds %.2f\n", uptime)

	_, _ = fmt.Fprintf(w, "# HELP cert_signer_requests_total Total HTTP requests handled\n")
	_, _ = fmt.Fprintf(w, "# TYPE cert_signer_requests_total counter\n")
	_, _ = fmt.Fprintf(w, "cert_signer_requests_total %d\n", h.metrics.requestsTotal.Load())

	_, _ = fmt.Fprintf(w, "# HELP cert_signer_issued_certificates_total Total X.509 client certificates successfully signed\n")
	_, _ = fmt.Fprintf(w, "# TYPE cert_signer_issued_certificates_total counter\n")
	_, _ = fmt.Fprintf(w, "cert_signer_issued_certificates_total %d\n", h.metrics.issuedTotal.Load())

	_, _ = fmt.Fprintf(w, "# HELP cert_signer_failures_total Total issuance failures\n")
	_, _ = fmt.Fprintf(w, "# TYPE cert_signer_failures_total counter\n")
	_, _ = fmt.Fprintf(w, "cert_signer_failures_total %d\n", h.metrics.failuresTotal.Load())

	_, _ = fmt.Fprintf(w, "# HELP cert_signer_auth_failures_total Total authentication/HMAC verification failures\n")
	_, _ = fmt.Fprintf(w, "# TYPE cert_signer_auth_failures_total counter\n")
	_, _ = fmt.Fprintf(w, "cert_signer_auth_failures_total %d\n", h.metrics.authFailsTotal.Load())

	_, _ = fmt.Fprintf(w, "# HELP go_goroutines Number of active goroutines\n")
	_, _ = fmt.Fprintf(w, "# TYPE go_goroutines gauge\n")
	_, _ = fmt.Fprintf(w, "go_goroutines %d\n", runtime.NumGoroutine())

	_, _ = fmt.Fprintf(w, "# HELP go_memstats_alloc_bytes Number of bytes allocated and still in use\n")
	_, _ = fmt.Fprintf(w, "# TYPE go_memstats_alloc_bytes gauge\n")
	_, _ = fmt.Fprintf(w, "go_memstats_alloc_bytes %d\n", m.Alloc)
}

func (h *Handler) issue(w http.ResponseWriter, r *http.Request) {
	h.metrics.requestsTotal.Add(1)

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	// Protect against unbounded body memory DOS attacks (limit to 1MB)
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	defer r.Body.Close()

	if !h.authorized(r, body) {
		h.metrics.authFailsTotal.Add(1)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

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
		h.metrics.failuresTotal.Add(1)
		h.logger.Error("Certificate issuance failed", "error", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.metrics.issuedTotal.Add(1)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) authorized(r *http.Request, body []byte) bool {
	if !h.validBearer(r.Header.Get("Authorization")) {
		h.logger.Warn("signer auth failed: invalid bearer token")
		return false
	}

	timestamp := strings.TrimSpace(r.Header.Get("x-signer-timestamp"))
	nonce := strings.TrimSpace(r.Header.Get("x-signer-nonce"))
	signature := normalizeHex(r.Header.Get("x-signer-signature"))
	if timestamp == "" || nonce == "" || signature == "" {
		h.logger.Warn("signer auth failed: missing signed freshness headers")
		return false
	}

	requestTime, err := parseUnixTimestamp(timestamp)
	if err != nil {
		h.logger.Warn("signer auth failed: invalid timestamp", "error", err)
		return false
	}
	if delta := time.Since(requestTime); delta > h.authMaxSkew || delta < -h.authMaxSkew {
		h.logger.Warn("signer auth failed: stale timestamp", "delta", delta)
		return false
	}

	expected := h.computeSignature(timestamp, nonce, body)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		h.logger.Warn("signer auth failed: invalid HMAC signature")
		return false
	}
	if !h.reserveNonce(nonce) {
		h.logger.Warn("signer auth failed: replay detected for nonce", "nonce", nonce)
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
