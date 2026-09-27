# Sandbox for Hone's agent loop (docs/workflow.md). Rebuild with `pnpm sandcastle:image`.
FROM node:24-bookworm

# build-essential and python3: node-pty has no Linux prebuild and compiles from source.
# xvfb, xauth and the libraries after them: Electron needs a display and these to open a window under Playwright.
RUN apt-get update && apt-get install -y --no-install-recommends \
  git curl jq ca-certificates \
  build-essential python3 \
  xvfb xauth \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libgbm1 libasound2 \
  libxss1 libxshmfence1 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libxtst6 libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# pnpm at the version in the root package.json's packageManager field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@latest && corepack enable

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/agent/.local/bin:$PATH"

# No co-author lines in commits or pull requests.
RUN mkdir -p /home/agent/.claude \
  && echo '{ "attribution": { "commit": "", "pr": "" } }' > /home/agent/.claude/settings.json

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
ENTRYPOINT ["sleep", "infinity"]
