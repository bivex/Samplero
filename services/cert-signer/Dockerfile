FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/cert-signer ./cmd/cert-signer

FROM scratch
COPY --from=build /out/cert-signer /cert-signer
USER 65532:65532
EXPOSE 8081
ENTRYPOINT ["/cert-signer"]

