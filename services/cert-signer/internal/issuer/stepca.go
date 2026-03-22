package issuer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type StepCAConfig struct {
	CAURL               string
	RootPath            string
	Provisioner         string
	ProvisionerPassword string
	ChainPath           string
	CommandTimeout      time.Duration
}

func NewStepCA(cfg StepCAConfig) (*Service, error) {
	chainPEM, err := os.ReadFile(cfg.ChainPath)
	if err != nil {
		return nil, fmt.Errorf("read step-ca chain: %w", err)
	}
	if cfg.CommandTimeout <= 0 {
		cfg.CommandTimeout = 15 * time.Second
	}
	return &Service{issueFunc: func(req IssueRequest) (IssueResponse, error) {
		return issueStepCA(cfg, chainPEM, req)
	}}, nil
}

func issueStepCA(cfg StepCAConfig, chainPEM []byte, req IssueRequest) (IssueResponse, error) {
	csr, err := parseCSR(req.CSRPem)
	if err != nil {
		return IssueResponse{}, err
	}
	workDir, err := os.MkdirTemp("", "stepca-issue-")
	if err != nil {
		return IssueResponse{}, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(workDir)
	csrPath := filepath.Join(workDir, "client.csr")
	crtPath := filepath.Join(workDir, "client.crt")
	if err := os.WriteFile(csrPath, []byte(req.CSRPem), 0o600); err != nil {
		return IssueResponse{}, fmt.Errorf("write csr: %w", err)
	}
	subject := strings.TrimSpace(csr.Subject.CommonName)
	if subject == "" {
		subject = strings.TrimSpace(req.MachineID)
	}
	tokenArgs := []string{"ca", "token", subject, "--cnf-file", csrPath, "--ca-url", cfg.CAURL, "--root", cfg.RootPath, "--issuer", cfg.Provisioner, "--provisioner-password-file", cfg.ProvisionerPassword}
	for _, san := range csr.DNSNames {
		tokenArgs = append(tokenArgs, "--san", san)
	}
	for _, ip := range csr.IPAddresses {
		tokenArgs = append(tokenArgs, "--san", ip.String())
	}
	token, err := runStep(cfg.CommandTimeout, tokenArgs...)
	if err != nil {
		return IssueResponse{}, err
	}
	if _, err := runStep(cfg.CommandTimeout, "ca", "sign", csrPath, crtPath, "--token", token, "--ca-url", cfg.CAURL, "--root", cfg.RootPath); err != nil {
		return IssueResponse{}, err
	}
	certPEM, err := os.ReadFile(crtPath)
	if err != nil {
		return IssueResponse{}, fmt.Errorf("read issued cert: %w", err)
	}
	cert, err := parseCert(string(certPEM))
	if err != nil {
		return IssueResponse{}, err
	}
	fp := sha256.Sum256(cert.Raw)
	return IssueResponse{Certificate: string(certPEM), CACertificate: string(chainPEM), Fingerprint: hex.EncodeToString(fp[:]), SubjectCN: cert.Subject.CommonName, Serial: strings.ToUpper(cert.SerialNumber.Text(16))}, nil
}

func runStep(timeout time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "step", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("step %s failed: %w: %s", strings.Join(args[:2], " "), err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

func parseCert(certPEM string) (*x509.Certificate, error) {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return nil, fmt.Errorf("invalid certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse certificate: %w", err)
	}
	return cert, nil
}
