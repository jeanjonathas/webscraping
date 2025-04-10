-- Criar schema para a empresa
CREATE SCHEMA IF NOT EXISTS dranimal;

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS dranimal.clientes (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE,
    nome VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20),
    contatos TEXT,
    endereco TEXT,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usuario_cadastro VARCHAR(100),
    data_atualizacao TIMESTAMP WITH TIME ZONE,
    usuario_atualizacao VARCHAR(100),
    grupos TEXT[],
    origem VARCHAR(100),
    situacao VARCHAR(50)
);

-- Tabela de animais
CREATE TABLE IF NOT EXISTS dranimal.animais (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE,
    nome VARCHAR(255) NOT NULL,
    especie VARCHAR(100),
    raca VARCHAR(100),
    data_nascimento DATE,
    cliente_id INTEGER REFERENCES dranimal.clientes(id),
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usuario_cadastro VARCHAR(100),
    data_atualizacao TIMESTAMP WITH TIME ZONE,
    usuario_atualizacao VARCHAR(100),
    situacao VARCHAR(50)
);
