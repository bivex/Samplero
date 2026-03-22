package main

import (
	"log"
	"net/http"

	"github.com/samplero/cert-signer/internal/config"
	"github.com/samplero/cert-signer/internal/httpapi"
	"github.com/samplero/cert-signer/internal/issuer"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	var service *issuer.Service
	if cfg.Backend == "stepca" {
		service, err = issuer.NewStepCA(issuer.StepCAConfig{
			CAURL:               cfg.StepCAURL,
			RootPath:            cfg.StepCARoot,
			Provisioner:         cfg.StepCAProv,
			ProvisionerPassword: cfg.StepCAPass,
			ChainPath:           cfg.CAChainPath,
			CommandTimeout:      cfg.WriteTimeout,
		})
	} else {
		service, err = issuer.New(cfg.CACertPath, cfg.CAKeyPath, cfg.CAChainPath, cfg.ValidityDays)
	}
	if err != nil {
		log.Fatalf("issuer init error: %v", err)
	}

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      httpapi.New(service, cfg.AuthToken, cfg.AuthSharedSecret, cfg.AuthMaxSkew),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	tlsConfig, err := config.BuildTLSConfig(cfg)
	if err != nil {
		log.Fatalf("tls config error: %v", err)
	}
	if tlsConfig != nil {
		server.TLSConfig = tlsConfig
	}

	log.Printf("cert-signer listening on %s", cfg.ListenAddr)
	var serveErr error
	if tlsConfig != nil {
		log.Printf("cert-signer signer mTLS enabled")
		serveErr = server.ListenAndServeTLS("", "")
	} else {
		serveErr = server.ListenAndServe()
	}
	if err := serveErr; err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
