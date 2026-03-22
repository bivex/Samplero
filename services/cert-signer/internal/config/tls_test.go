package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildTLSConfigLoadsServerKeypairAndClientCA(t *testing.T) {
	tmp := t.TempDir()
	caCertPEM, caKey, caCert := generateCA(t)
	serverCertPEM, serverKeyPEM := generateLeaf(t, caCert, caKey)

	caPath := writePEM(t, tmp, "client-ca.crt", caCertPEM)
	certPath := writePEM(t, tmp, "server.crt", serverCertPEM)
	keyPath := writePEM(t, tmp, "server.key", serverKeyPEM)

	tlsConfig, err := BuildTLSConfig(Config{
		TLSCertPath:     certPath,
		TLSKeyPath:      keyPath,
		TLSClientCAPath: caPath,
	})
	if err != nil {
		t.Fatalf("BuildTLSConfig: %v", err)
	}
	if tlsConfig == nil {
		t.Fatalf("expected tls config")
	}
	if tlsConfig.ClientAuth != tls.RequireAndVerifyClientCert {
		t.Fatalf("expected mTLS client auth, got %v", tlsConfig.ClientAuth)
	}
	if len(tlsConfig.Certificates) != 1 {
		t.Fatalf("expected one server certificate, got %d", len(tlsConfig.Certificates))
	}
	if tlsConfig.ClientCAs == nil {
		t.Fatalf("expected client CA pool")
	}
}

func generateCA(t *testing.T) ([]byte, *rsa.PrivateKey, *x509.Certificate) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate ca key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "test-ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create ca cert: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse ca cert: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), key, cert
}

func generateLeaf(t *testing.T, issuer *x509.Certificate, issuerKey *rsa.PrivateKey) ([]byte, []byte) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate leaf key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: "cert-signer"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"cert-signer"},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, issuer, &key.PublicKey, issuerKey)
	if err != nil {
		t.Fatalf("create leaf cert: %v", err)
	}
	keyDER := x509.MarshalPKCS1PrivateKey(key)
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyDER})
}

func writePEM(t *testing.T, dir, name string, contents []byte) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}
