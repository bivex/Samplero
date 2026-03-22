package config

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

func BuildTLSConfig(cfg Config) (*tls.Config, error) {
	if cfg.TLSCertPath == "" {
		return nil, nil
	}

	certificate, err := tls.LoadX509KeyPair(cfg.TLSCertPath, cfg.TLSKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load signer TLS keypair: %w", err)
	}

	clientCABytes, err := os.ReadFile(cfg.TLSClientCAPath)
	if err != nil {
		return nil, fmt.Errorf("read signer client CA: %w", err)
	}

	clientCAs := x509.NewCertPool()
	if !clientCAs.AppendCertsFromPEM(clientCABytes) {
		return nil, fmt.Errorf("parse signer client CA bundle")
	}

	return &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{certificate},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    clientCAs,
	}, nil
}
