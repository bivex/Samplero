package issuer

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestIssueCreatesClientCertSignedByCA(t *testing.T) {
	tmp := t.TempDir()
	caCertPath, caKeyPath, caChainPath := writeTestCA(t, tmp)
	service, err := New(caCertPath, caKeyPath, caChainPath, 30)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	csrPEM, csrKey := writeTestCSR(t)
	_ = csrKey
	resp, err := service.Issue(IssueRequest{CSRPem: csrPEM, SerialNumber: "ABC123", MachineID: "device-1", KeyHash: "deadbeefdeadbeef"})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if resp.SubjectCN != "client:device-1:deadbeefdeadbeef" {
		t.Fatalf("unexpected CN: %s", resp.SubjectCN)
	}
	block, _ := pem.Decode([]byte(resp.Certificate))
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("parse cert: %v", err)
	}
	if cert.Subject.CommonName != resp.SubjectCN {
		t.Fatalf("CN mismatch")
	}
	if resp.Serial == "" {
		t.Fatalf("expected serial in response")
	}
	if len(cert.ExtKeyUsage) == 0 || cert.ExtKeyUsage[0] != x509.ExtKeyUsageClientAuth {
		t.Fatalf("missing client auth EKU")
	}
	if resp.CACertificate == "" {
		t.Fatalf("expected CA chain in response")
	}
}

func writeTestCA(t *testing.T, dir string) (string, string, string) {
	t.Helper()
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	tpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Test CA"}, NotBefore: time.Now(), NotAfter: time.Now().AddDate(1, 0, 0), IsCA: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign, BasicConstraintsValid: true}
	der, _ := x509.CreateCertificate(rand.Reader, tpl, tpl, &key.PublicKey, key)
	certPath := filepath.Join(dir, "ca.crt")
	keyPath := filepath.Join(dir, "ca.key")
	chainPath := filepath.Join(dir, "ca-chain.crt")
	_ = os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600)
	_ = os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}), 0o600)
	_ = os.WriteFile(chainPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600)
	return certPath, keyPath, chainPath
}

func writeTestCSR(t *testing.T) (string, *rsa.PrivateKey) {
	t.Helper()
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	der, _ := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{CommonName: "ignored"}}, key)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})), key
}
