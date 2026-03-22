package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/samplero/cert-signer/internal/issuer"
)

type stubIssuer struct {
	calls int
}

func (s *stubIssuer) Issue(req issuer.IssueRequest) (issuer.IssueResponse, error) {
	s.calls++
	return issuer.IssueResponse{Certificate: "CERT", CACertificate: "CA", Fingerprint: "FP", SubjectCN: "client:test:hash", Serial: req.SerialNumber}, nil
}

func TestIssueAcceptsBearerAndSignedFreshRequest(t *testing.T) {
	service := &stubIssuer{}
	handler := New(service, "token-1", "shared-1", 60*time.Second)
	body := []byte(`{"csr_pem":"CSR","serial_number":"SER-1","machine_id":"machine-1","key_hash":"hash-1"}`)
	req := signedIssueRequest(body, "token-1", "shared-1", strconv.FormatInt(time.Now().Unix(), 10), "nonce-1")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if service.calls != 1 {
		t.Fatalf("expected issue to be called once, got %d", service.calls)
	}
}

func TestIssueRejectsReplayNonce(t *testing.T) {
	service := &stubIssuer{}
	handler := New(service, "token-1", "shared-1", 60*time.Second)
	body := []byte(`{"csr_pem":"CSR","serial_number":"SER-1","machine_id":"machine-1","key_hash":"hash-1"}`)
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)

	first := httptest.NewRecorder()
	handler.ServeHTTP(first, signedIssueRequest(body, "token-1", "shared-1", timestamp, "nonce-replay"))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request 200, got %d: %s", first.Code, first.Body.String())
	}

	second := httptest.NewRecorder()
	handler.ServeHTTP(second, signedIssueRequest(body, "token-1", "shared-1", timestamp, "nonce-replay"))
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("expected replay request 401, got %d: %s", second.Code, second.Body.String())
	}
	if service.calls != 1 {
		t.Fatalf("expected issue to be called once after replay, got %d", service.calls)
	}
}

func TestIssueRejectsStaleTimestamp(t *testing.T) {
	service := &stubIssuer{}
	handler := New(service, "token-1", "shared-1", 30*time.Second)
	body := []byte(`{"csr_pem":"CSR","serial_number":"SER-1","machine_id":"machine-1","key_hash":"hash-1"}`)
	req := signedIssueRequest(body, "token-1", "shared-1", strconv.FormatInt(time.Now().Add(-2*time.Minute).Unix(), 10), "nonce-stale")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rr.Code, rr.Body.String())
	}
	if service.calls != 0 {
		t.Fatalf("expected issue not to be called, got %d", service.calls)
	}
}

func signedIssueRequest(body []byte, token, secret, timestamp, nonce string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/v1/certificates/issue", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("x-signer-timestamp", timestamp)
	req.Header.Set("x-signer-nonce", nonce)
	req.Header.Set("x-signer-signature", signBody(secret, timestamp, nonce, body))
	return req
}

func signBody(secret, timestamp, nonce string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write([]byte(nonce))
	_, _ = mac.Write([]byte("."))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
