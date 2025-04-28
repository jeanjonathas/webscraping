#!/bin/bash
set -e

# Atualizar e instalar dependências
apt-get update
apt-get install -y git

# Clonar o repositório
git clone https://github.com/jeanjonathas/webscraping.git /app

# Entrar no diretório do projeto
cd /app/vetsoft

# Instalar dependências do Node.js
npm install --no-fund --no-audit --legacy-peer-deps
npm install --save-dev typescript @types/react @types/react-dom

# Instalar e configurar o Playwright
npm install -g playwright
npx playwright install chromium

# Compilar o TypeScript
npx tsc

# Iniciar o servidor
NODE_ENV=production npm run start
