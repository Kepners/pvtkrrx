# PVTKRRX hosted-relay container.
#
# CRITICAL: this Dockerfile exists specifically to fix the production font bug.
# Coolify previously auto-detected a Node.js buildpack with no font support,
# so every sports poster rendered text as `□` boxes (verified 2026-05-01 via
# `fc-list` empty inside the live container). This image installs:
#
#   - fontconfig + DejaVu/Liberation/Noto for system-wide fallback
#   - fonts-jetbrains-mono (the canonical mono font)
#   - Google Fonts: Bebas Neue, Inter, Playfair Display (the canonical
#     branded fonts referenced in src/utils/sportsPosterTemplates.js)
#
# After install, fc-cache -fv builds the font cache so sharp + Pango can
# resolve the @font-face names referenced in the SVG templates.
#
# Coolify will auto-detect this Dockerfile and use it instead of the default
# Node buildpack on the next rebuild.

FROM node:22-slim

# System fonts + tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
        fontconfig \
        fonts-liberation \
        fonts-dejavu-core \
        fonts-noto-core \
        fonts-jetbrains-mono \
        ca-certificates \
        wget \
        && rm -rf /var/lib/apt/lists/*

# Bundle the canonical branded fonts from the official Google Fonts repo so
# sharp/Pango can resolve the @font-face names PVTKRRX SVG templates use:
# Bebas Neue, Inter, Playfair Display. JetBrains Mono ships via apt above.
RUN mkdir -p /usr/share/fonts/truetype/pvtkrrx && cd /usr/share/fonts/truetype/pvtkrrx \
        && wget -q https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf \
        && wget -q https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf -O Inter-Variable.ttf \
        && wget -q https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf -O PlayfairDisplay-Variable.ttf \
        && wget -q https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf -O PlayfairDisplay-Italic-Variable.ttf \
        && fc-cache -fv >/dev/null

# Confirm the four canonical font families are now resolvable; fail the build
# if any are missing so a broken-text production deploy never escapes again.
RUN sh -c 'set -e; for f in "Bebas Neue" "Inter" "Playfair Display" "JetBrains Mono"; do \
        if ! fc-list | grep -qi "$f"; then echo "FONT MISSING: $f"; exit 1; fi; \
        echo "OK: $f"; \
    done'

WORKDIR /app

# Install production deps first so Docker layer cache can reuse them when
# only source files change.
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY . .

# Coolify routes inbound traffic to port 3000 by default for Node services.
ENV PORT=3000
ENV PVTKRRX_HOSTED_RELAY=true
EXPOSE 3000

CMD ["node", "index.js"]
