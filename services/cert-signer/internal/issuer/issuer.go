package issuer

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"strings"
	"time"
)

type Service struct {
	issueFunc func(IssueRequest) (IssueResponse, error)
}

type IssueRequest struct {
	CSRPem       string `json:"csr_pem"`
	SerialNumber string `json:"serial_number"`
	MachineID    string `json:"machine_id"`
	KeyHash      string `json:"key_hash"`
}

type IssueResponse struct {
	Certificate   string `json:"certificate"`
	CACertificate string `json:"ca_certificate"`
	Fingerprint   string `json:"fingerprint"`
	SubjectCN     string `json:"subject_cn"`
	Serial        string `json:"serial"`
}

func New(caCertPath, caKeyPath, caChainPath string, validityDays int) (*Service, error) {
	caCertPEM, err := os.ReadFile(caCertPath)
	if err != nil {
		return nil, fmt.Errorf("read ca cert: %w", err)
	}
	caChainPEM, err := os.ReadFile(caChainPath)
	if err != nil {
		return nil, fmt.Errorf("read ca chain: %w", err)
	}
	caKeyPEM, err := os.ReadFile(caKeyPath)
	if err != nil {
		return nil, fmt.Errorf("read ca key: %w", err)
	}
	caCertBlock, _ := pem.Decode(caCertPEM)
	if caCertBlock == nil {
		return nil, fmt.Errorf("invalid CA cert PEM")
	}
	caCert, err := x509.ParseCertificate(caCertBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse ca cert: %w", err)
	}
	if !caCert.IsCA {
		return nil, fmt.Errorf("CA cert must be a CA certificate")
	}
	if caCert.KeyUsage&x509.KeyUsageCertSign == 0 {
		return nil, fmt.Errorf("CA cert must allow certificate signing")
	}
	caKeyBlock, _ := pem.Decode(caKeyPEM)
	if caKeyBlock == nil {
		return nil, fmt.Errorf("invalid CA key PEM")
	}
	caKeyAny, err := x509.ParsePKCS8PrivateKey(caKeyBlock.Bytes)
	if err != nil {
		caKeyAny, err = x509.ParsePKCS1PrivateKey(caKeyBlock.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse ca key: %w", err)
		}
	}
	caKey, ok := caKeyAny.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("CA key must be RSA")
	}
	service := &Service{}
	service.issueFunc = func(req IssueRequest) (IssueResponse, error) {
		return issueLocal(caCert, caKey, caChainPEM, validityDays, req)
	}
	return service, nil
}

func (s *Service) Issue(req IssueRequest) (IssueResponse, error) {
	return s.issueFunc(req)
}

func issueLocal(caCert *x509.Certificate, caKey *rsa.PrivateKey, caChainPEM []byte, validityDays int, req IssueRequest) (IssueResponse, error) {
	block, _ := pem.Decode([]byte(req.CSRPem))
	if block == nil {
		return IssueResponse{}, fmt.Errorf("invalid CSR PEM")
	}
	csr, err := x509.ParseCertificateRequest(block.Bytes)
	if err != nil {
		return IssueResponse{}, fmt.Errorf("parse csr: %w", err)
	}
	if err := csr.CheckSignature(); err != nil {
		return IssueResponse{}, fmt.Errorf("invalid csr signature: %w", err)
	}
	serialInt, ok := new(big.Int).SetString(req.SerialNumber, 16)
	if !ok {
		serialInt = randomSerial()
	}
	cn := fmt.Sprintf("client:%s:%s", req.MachineID, req.KeyHash)
	now := time.Now().UTC()
	tpl := &x509.Certificate{
		SerialNumber:          serialInt,
		Subject:               pkix.Name{CommonName: cn, Organization: csr.Subject.Organization, Country: csr.Subject.Country, Province: csr.Subject.Province, Locality: csr.Subject.Locality},
		Issuer:                caCert.Subject,
		NotBefore:             now,
		NotAfter:              now.AddDate(0, 0, validityDays),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{req.SerialNumber},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, tpl, caCert, csr.PublicKey, caKey)
	if err != nil {
		return IssueResponse{}, fmt.Errorf("create cert: %w", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	fp := sha256.Sum256(der)
	return IssueResponse{Certificate: string(certPEM), CACertificate: string(caChainPEM), Fingerprint: hex.EncodeToString(fp[:]), SubjectCN: cn, Serial: strings.ToUpper(serialInt.Text(16))}, nil
}

func parseCSR(csrPEM string) (*x509.CertificateRequest, error) {
	block, _ := pem.Decode([]byte(csrPEM))
	if block == nil {
		return nil, fmt.Errorf("invalid CSR PEM")
	}
	csr, err := x509.ParseCertificateRequest(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse csr: %w", err)
	}
	if err := csr.CheckSignature(); err != nil {
		return nil, fmt.Errorf("invalid csr signature: %w", err)
	}
	return csr, nil
}

func randomSerial() *big.Int {
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	return serial
}
