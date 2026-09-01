# Multi-stage production build for cert-signer microservice
FROM golang:1.24-alpine AS build

RUN apk add --no-cache git ca-certificates

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/cert-signer ./cmd/cert-signer

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

RUN addgroup -S nonroot -g 65532 && adduser -S nonroot -u 65532 -G nonroot

COPY --from=build /out/cert-signer /usr/local/bin/cert-signer

USER 65532:65532

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/cert-signer"]
