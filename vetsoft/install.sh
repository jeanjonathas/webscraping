#!/bin/bash

# Instalar TypeScript globalmente
npm install -g typescript

# Instalar dependências do projeto
npm install --no-fund --no-audit --legacy-peer-deps

# Compilar o código TypeScript
npx tsc

echo "Instalação concluída!"
