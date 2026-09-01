package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/samplero/cert-signer/internal/config"
	"github.com/samplero/cert-signer/internal/httpapi"
	"github.com/samplero/cert-signer/internal/issuer"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("Failed to load configuration", "error", err)
		os.Exit(1)
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
		logger.Error("Failed to initialize CA issuer service", "error", err)
		os.Exit(1)
	}

	handler := httpapi.New(service, cfg.AuthToken, cfg.AuthSharedSecret, cfg.AuthMaxSkew)

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  120 * time.Second,
	}

	tlsConfig, err := config.BuildTLSConfig(cfg)
	if err != nil {
		logger.Error("Failed to build TLS configuration", "error", err)
		os.Exit(1)
	}
	if tlsConfig != nil {
		server.TLSConfig = tlsConfig
	}

	// Graceful shutdown listener
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		logger.Info("Starting cert-signer service",
			"addr", cfg.ListenAddr,
			"backend", cfg.Backend,
			"mtls_enabled", tlsConfig != nil,
		)

		var serveErr error
		if tlsConfig != nil {
			serveErr = server.ListenAndServeTLS("", "")
		} else {
			serveErr = server.ListenAndServe()
		}

		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("Server encountered fatal error", "error", serveErr)
			os.Exit(1)
		}
	}()

	sig := <-stopChan
	logger.Info("Received shutdown signal, draining connections...", "signal", sig.String())

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Server forced to shutdown", "error", err)
		_ = server.Close()
	} else {
		logger.Info("cert-signer service stopped gracefully")
	}
}
