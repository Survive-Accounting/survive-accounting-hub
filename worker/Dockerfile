# Render worker — Bun + ffmpeg. Built/deployed by `fly deploy` from worker/.
FROM oven/bun:1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY src ./src
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/server.ts"]
