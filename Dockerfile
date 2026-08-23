FROM python@sha256:356b0d18f9385f4bdcc673af60e1e64c9d1504952e4ec36ee32044c722a6bc4e AS python-runtime

FROM node@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS toolchain

ENV DEBIAN_FRONTEND=noninteractive
COPY runtime/debian-packages.tar /tmp/debian-packages.tar
RUN mkdir /tmp/debs && tar -xf /tmp/debian-packages.tar -C /tmp/debs && \
    (dpkg -i /tmp/debs/*.deb || true) && (dpkg --configure -a || true) && \
    (dpkg -i /tmp/debs/*.deb || true) && (dpkg --configure -a || true) && \
    dpkg -i /tmp/debs/*.deb && dpkg --configure -a && \
    rm -rf /tmp/debs /tmp/debian-packages.tar

COPY .rvs-cache/artifacts/sha256/ecf458e716d1f2f14db3f83575165df4911462933fff9863c3b3da60fe802edf /tmp/x264.tar.gz
COPY .rvs-cache/artifacts/sha256/05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41 /tmp/ffmpeg.tar.xz
COPY .rvs-cache/artifacts/sha256/05e3f1994bcd2dd35aad33739832deb5ac5a3db46b4bcf39c8cdc281d72ed7d7 /tmp/imagemagick.tar.xz
RUN mkdir -p /tmp/build/x264 /tmp/build/ffmpeg /tmp/build/imagemagick /opt/rvs && \
    tar -xzf /tmp/x264.tar.gz -C /tmp/build/x264 --strip-components=1 && \
    cd /tmp/build/x264 && \
    ./configure --prefix=/opt/rvs --enable-static --disable-cli --disable-opencl && \
    make -j2 && make install && \
    tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/build/ffmpeg --strip-components=1 && \
    cd /tmp/build/ffmpeg && \
    PKG_CONFIG_PATH=/opt/rvs/lib/pkgconfig ./configure \
      --prefix=/opt/rvs \
      --disable-debug \
      --disable-doc \
      --enable-gpl \
      --enable-libfreetype \
      --enable-libharfbuzz \
      --enable-libx264 \
      --extra-cflags=-I/opt/rvs/include \
      --extra-ldflags=-L/opt/rvs/lib && \
    make -j2 && make install && \
    tar -xJf /tmp/imagemagick.tar.xz -C /tmp/build/imagemagick --strip-components=1 && \
    cd /tmp/build/imagemagick && \
    ./configure --prefix=/opt/rvs --disable-openmp --without-magick-plus-plus --without-perl && \
    make -j2 && make install

FROM node@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848 AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/opt/rvs/bin:/opt/uv:/usr/local/bin:$PATH \
    LD_LIBRARY_PATH=/opt/rvs/lib \
    CHROME_PATH=/opt/chrome/chrome \
    EXPECTED_CHROMIUM_VERSION=151.0.7922.138

COPY runtime/debian-packages.tar /tmp/debian-packages.tar
RUN mkdir /tmp/debs && tar -xf /tmp/debian-packages.tar -C /tmp/debs && \
    (dpkg -i /tmp/debs/*.deb || true) && (dpkg --configure -a || true) && \
    (dpkg -i /tmp/debs/*.deb || true) && (dpkg --configure -a || true) && \
    dpkg -i /tmp/debs/*.deb && dpkg --configure -a && \
    rm -rf /tmp/debs /tmp/debian-packages.tar
COPY --from=python-runtime /usr/local/ /usr/local/
COPY --from=toolchain /opt/rvs/ /opt/rvs/
COPY .rvs-cache/artifacts/sha256/56dd1b66701ecb62fe896abb919444e4b83c5e8645cca953e6ddd496ff8a0feb /tmp/uv.tar.gz
COPY .rvs-cache/artifacts/sha512/9a6f330a95b66446ea088faf1521405a8a01f07fde7124cc9958dfed52d4bb436737e65b08f85f37b46fcba375092558ac51262b816844b22f63406ed166bfee /tmp/pnpm.tgz
RUN mkdir -p /opt/uv && \
    tar -xzf /tmp/uv.tar.gz -C /tmp && \
    cp /tmp/uv-x86_64-unknown-linux-gnu/uv /tmp/uv-x86_64-unknown-linux-gnu/uvx /opt/uv/ && \
    npm install --global /tmp/pnpm.tgz --ignore-scripts --offline && \
    rm -rf /tmp/uv.tar.gz /tmp/uv-x86_64-unknown-linux-gnu /tmp/pnpm.tgz
COPY runtime/hydrated/chrome-for-testing/chrome-linux64/ /opt/chrome/
COPY verification/contract/fonts/ /opt/rvs/fonts/
COPY scripts/runtime/preflight.mjs /opt/rvs/preflight.mjs

WORKDIR /workspace
CMD ["node", "/opt/rvs/preflight.mjs"]

FROM runtime AS compiler
ENV RVS_ROOT=/workspace \
    UV_CACHE_DIR=/workspace/.uv-cache \
    PYTHONPATH=/workspace:/workspace/compiler/.venv/lib/python3.12/site-packages:/workspace/compiler/.venv/lib64/python3.12/site-packages
COPY compiler /workspace/compiler
COPY compiler/.venv /workspace/compiler/.venv
COPY runtime/supply-closure-manifest.json /workspace/runtime/supply-closure-manifest.json
COPY runtime/python-wheel-manifest.json /workspace/runtime/python-wheel-manifest.json
COPY .rvs-cache/artifacts/ /workspace/.rvs-cache/artifacts/
COPY verification/contract/fonts/ /workspace/verification/contract/fonts/
COPY verification/contract/fixtures/ /workspace/verification/contract/fixtures/
COPY .omo/drafts/reference-video-studio-saas-media-contract-v2.json /workspace/.omo/drafts/reference-video-studio-saas-media-contract-v2.json
COPY .omo/drafts/reference-video-studio-saas-fixture-contract-v2.json /workspace/.omo/drafts/reference-video-studio-saas-fixture-contract-v2.json
WORKDIR /workspace
CMD ["python3.12", "-m", "compiler.preflight"]
