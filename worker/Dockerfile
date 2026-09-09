# Render worker — Bun + ffmpeg. Built/deployed by `fly deploy` from worker/.
FROM oven/bun:1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY src ./src
# THE CAPTION FONT. libass resolves a font by NAME, and silently falls back to whatever it can
# find when the name is missing — so a missing Rubik Black is not an error, it is a burn that
# quietly looks wrong. Vendored rather than fetched at build time: a GitHub outage must not
# change what Lee's captions look like. burn_captions passes this directory as fontsdir.
COPY fonts ./fonts
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/server.ts"]
