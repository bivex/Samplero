package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	ListenAddr       string
	AuthToken        string
	AuthSharedSecret string
	AuthMaxSkew      time.Duration
	TLSCertPath      string
	TLSKeyPath       string
	TLSClientCAPath  string
	Backend          string
	CACertPath       string
	CAChainPath      string
	CAKeyPath        string
	StepCAURL        string
	StepCARoot       string
	StepCAProv       string
	StepCAPass       string
	ValidityDays     int
	ReadTimeout      time.Duration
	WriteTimeout     time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddr:       getEnv("CERT_SIGNER_LISTEN_ADDR", ":8081"),
		AuthToken:        os.Getenv("CERT_SIGNER_AUTH_TOKEN"),
		AuthSharedSecret: os.Getenv("CERT_SIGNER_AUTH_SHARED_SECRET"),
		AuthMaxSkew:      getEnvDuration("CERT_SIGNER_AUTH_MAX_SKEW", 60*time.Second),
		TLSCertPath:      os.Getenv("CERT_SIGNER_TLS_CERT_PATH"),
		TLSKeyPath:       os.Getenv("CERT_SIGNER_TLS_KEY_PATH"),
		TLSClientCAPath:  os.Getenv("CERT_SIGNER_TLS_CLIENT_CA_PATH"),
		Backend:          getEnv("CERT_SIGNER_BACKEND", "local"),
		CACertPath:       os.Getenv("CERT_SIGNER_CA_CERT_PATH"),
		CAChainPath:      os.Getenv("CERT_SIGNER_CA_CHAIN_PATH"),
		CAKeyPath:        os.Getenv("CERT_SIGNER_CA_KEY_PATH"),
		StepCAURL:        os.Getenv("CERT_SIGNER_STEP_CA_URL"),
		StepCARoot:       os.Getenv("CERT_SIGNER_STEP_CA_ROOT_PATH"),
		StepCAProv:       os.Getenv("CERT_SIGNER_STEP_CA_PROVISIONER"),
		StepCAPass:       os.Getenv("CERT_SIGNER_STEP_CA_PASSWORD_FILE"),
		ValidityDays:     getEnvInt("CERT_SIGNER_VALIDITY_DAYS", 365),
		ReadTimeout:      getEnvDuration("CERT_SIGNER_READ_TIMEOUT", 10*time.Second),
		WriteTimeout:     getEnvDuration("CERT_SIGNER_WRITE_TIMEOUT", 10*time.Second),
	}

	if cfg.AuthToken == "" {
		return Config{}, fmt.Errorf("CERT_SIGNER_AUTH_TOKEN is required")
	}
	if cfg.AuthSharedSecret == "" {
		return Config{}, fmt.Errorf("CERT_SIGNER_AUTH_SHARED_SECRET is required")
	}
	if cfg.AuthMaxSkew <= 0 {
		return Config{}, fmt.Errorf("CERT_SIGNER_AUTH_MAX_SKEW must be > 0")
	}
	if cfg.TLSCertPath != "" || cfg.TLSKeyPath != "" || cfg.TLSClientCAPath != "" {
		if cfg.TLSCertPath == "" || cfg.TLSKeyPath == "" || cfg.TLSClientCAPath == "" {
			return Config{}, fmt.Errorf("CERT_SIGNER_TLS_CERT_PATH, CERT_SIGNER_TLS_KEY_PATH, and CERT_SIGNER_TLS_CLIENT_CA_PATH must be configured together")
		}
	}
	if cfg.ValidityDays <= 0 {
		return Config{}, fmt.Errorf("CERT_SIGNER_VALIDITY_DAYS must be > 0")
	}
	if cfg.Backend == "stepca" {
		if cfg.StepCAURL == "" || cfg.StepCARoot == "" || cfg.StepCAProv == "" || cfg.StepCAPass == "" {
			return Config{}, fmt.Errorf("stepca backend requires CERT_SIGNER_STEP_CA_URL, CERT_SIGNER_STEP_CA_ROOT_PATH, CERT_SIGNER_STEP_CA_PROVISIONER, and CERT_SIGNER_STEP_CA_PASSWORD_FILE")
		}
		if cfg.CAChainPath == "" {
			return Config{}, fmt.Errorf("CERT_SIGNER_CA_CHAIN_PATH is required for stepca backend")
		}
		return cfg, nil
	}
	if cfg.CACertPath == "" {
		return Config{}, fmt.Errorf("CERT_SIGNER_CA_CERT_PATH is required")
	}
	if cfg.CAKeyPath == "" {
		return Config{}, fmt.Errorf("CERT_SIGNER_CA_KEY_PATH is required")
	}
	if cfg.CAChainPath == "" {
		cfg.CAChainPath = cfg.CACertPath
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil {
			return parsed
		}
	}
	return fallback
}
