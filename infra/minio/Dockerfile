# syntax=docker/dockerfile:1

FROM golang:1.24.8-alpine3.22 AS build

ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
ARG MC_COMMIT=7394ce0dd2a80935aded936b09fa12cbb3cb8096

RUN apk add --no-cache git

WORKDIR /src

RUN git init minio \
    && git -C minio remote add origin https://github.com/minio/minio.git \
    && git -C minio fetch --depth 1 origin "${MINIO_COMMIT}" \
    && git -C minio checkout --detach FETCH_HEAD \
    && test "$(git -C minio rev-parse HEAD)" = "${MINIO_COMMIT}"

RUN git init mc \
    && git -C mc remote add origin https://github.com/minio/mc.git \
    && git -C mc fetch --depth 1 origin "${MC_COMMIT}" \
    && git -C mc checkout --detach FETCH_HEAD \
    && test "$(git -C mc rev-parse HEAD)" = "${MC_COMMIT}"

RUN cd minio \
    && CGO_ENABLED=0 go build -tags kqueue -trimpath \
        --ldflags "$(go run buildscripts/gen-ldflags.go)" \
        -o /out/minio

RUN cd mc \
    && CGO_ENABLED=0 go build -tags kqueue -trimpath \
        --ldflags "$(go run buildscripts/gen-ldflags.go)" \
        -o /out/mc

FROM alpine:3.22.2

LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 1000 minio \
    && adduser -S -D -h /home/minio -u 1000 -G minio minio \
    && mkdir -p /data /usr/share/licenses/minio /usr/share/licenses/mc \
    && chown -R minio:minio /data /home/minio

COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /out/mc /usr/local/bin/mc
COPY --from=build /src/minio/LICENSE /usr/share/licenses/minio/LICENSE
COPY --from=build /src/mc/LICENSE /usr/share/licenses/mc/LICENSE

USER minio
WORKDIR /home/minio

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
