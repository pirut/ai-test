FROM golang:1.22-bookworm AS go-toolchain

FROM node:22-bookworm

COPY --from=go-toolchain /usr/local/go /usr/local/go
COPY infra/pi-image/local-build/rpi-image-gen-root-namespace.patch /tmp/rpi-image-gen-root-namespace.patch
ENV PATH="/usr/local/go/bin:${PATH}"
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    patch \
    rsync \
    sudo \
    xz-utils \
  && ln -s /usr/local/go/bin/go /usr/local/bin/go \
  && ln -s /usr/local/go/bin/gofmt /usr/local/bin/gofmt \
  && git clone --depth 1 --branch v2.7.0 \
    https://github.com/raspberrypi/rpi-image-gen.git \
    /opt/rpi-image-gen \
  && patch --directory=/opt/rpi-image-gen --strip=1 < /tmp/rpi-image-gen-root-namespace.patch \
  && /opt/rpi-image-gen/install_deps.sh \
  && NS_SETUP='_ns_setup() { [[ -n "${_NS_APT_ARCHIVES:-}" ]] && return 1; return 0; }' /opt/rpi-image-gen/bin/ns true \
  && go version \
  && node --version \
  && xz --version

RUN apt-get update \
  && apt-get install -y --no-install-recommends udev \
  && udevadm --version

WORKDIR /build/ai-test
