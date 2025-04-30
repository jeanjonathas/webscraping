# Documentação da API VetSoft

Esta documentação descreve os endpoints disponíveis na API VetSoft, que permite extrair e inserir dados no sistema VetSoft através de automação com Playwright.

## Autenticação

Todas as rotas da API são protegidas por uma chave de API (API Key). A chave deve ser fornecida em todas as requisições de uma das seguintes formas:

1. **Header HTTP**: `x-api-key: Je@nfree2525`
2. **Parâmetro de query**: `?api_key=Je@nfree2525`

## Parâmetros Comuns

Alguns parâmetros de query são comuns a vários endpoints:

- `show=true` - Mostra o navegador durante a execução (útil para debug)
- `refresh=true` - Força a atualização da página, ignorando o cache

## Endpoints Disponíveis

### 1. Internação

#### GET /internacao

Retorna a lista de animais internados no momento.

**Parâmetros de Query:**
- `situacao` - Filtra por situação (ex: "Internado", "Alta")

**Exemplo de Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "animal": {
        "id": "1867",
        "nome": "Rex",
        "especie": "Canino",
        "raca": "SRD"
      },
      "tutor": {
        "id": "1234",
        "nome": "João Silva"
      },
      "alojamento": "Canil 01",
      "situacao": "Internado",
      "dias_internado": "3",
      "codigo_internacao": "2044",
      "tipo_internacao": "Clínica"
    }
  ],
  "total": 1
}
```

### 2. Cliente

#### GET /cliente/:id

Retorna os dados detalhados de um cliente específico e seus animais.

**Parâmetros de Path:**
- `id` - Código do cliente no sistema VetSoft

**Exemplo de Resposta:**
```json
{
  "success": true,
  "data": {
    "codigo": "1234",
    "nome": "João Silva",
    "tipo_pessoa": "pf",
    "cpf_cnpj": "123.456.789-00",
    "endereco": {
      "logradouro": "Rua das Flores",
      "numero": "123",
      "bairro": "Centro",
      "cidade": "Florianópolis",
      "estado": "SC"
    },
    "contatos": [
      {
        "tipo": "Celular",
        "valor": "(48) 99999-9999",
        "whatsapp": true
      }
    ],
    "animais": [
      {
        "codigo": "1867",
        "nome": "Rex",
        "especie": "Canino",
        "raca": "SRD",
        "sexo": "Macho",
        "situacao": "Ativo",
        "internado": true
      }
    ]
  }
}
```

### 3. Passagem de Plantão

#### POST /passagem-plantao

Insere uma passagem de plantão na ficha de um animal internado.

**Corpo da Requisição (JSON):**
```json
{
  "cod_animal": "1867",
  "cod_internacao": "2044",
  "responsavel": "fernando barreto",
  "observacao": "Texto da passagem de plantão que será inserido no editor rich text"
}
```

**Parâmetros:**
- `cod_animal` (obrigatório) - Código do animal internado
- `cod_internacao` (obrigatório) - Código da internação
- `responsavel` (obrigatório) - Nome do responsável pela passagem (usado para busca no formulário)
- `observacao` (obrigatório) - Texto da passagem de plantão (inserido no editor rich text)

**Exemplo de Resposta:**
```json
{
  "success": true,
  "message": "Passagem de plantão inserida com sucesso",
  "data": {
    "cod_animal": "1867",
    "cod_internacao": "2044",
    "responsavel": "fernando barreto",
    "timestamp": "2025-04-30T05:34:18.000Z"
  }
}
```

### 4. Animais por Ano

#### GET /animais/ano/:ano

Retorna estatísticas de animais cadastrados em um determinado ano.

**Parâmetros de Path:**
- `ano` - Ano para buscar estatísticas (ex: "2025")

**Exemplo de Resposta:**
```json
{
  "success": true,
  "data": {
    "ano": "2025",
    "total": 150,
    "por_especie": {
      "Canino": 80,
      "Felino": 60,
      "Outros": 10
    }
  }
}
```

## Códigos de Erro

A API pode retornar os seguintes códigos de erro:

- `400 Bad Request` - Parâmetros inválidos ou ausentes
- `401 Unauthorized` - API Key inválida ou ausente
- `500 Internal Server Error` - Erro interno do servidor
- `503 Service Unavailable` - Limite de tentativas excedido (falha no login ou navegação)

## Exemplos de Uso com cURL

### Obter lista de internações
```bash
curl -X GET "http://localhost:3000/internacao?api_key=Je@nfree2525"
```

### Obter dados de um cliente
```bash
curl -X GET "http://localhost:3000/cliente/1234?api_key=Je@nfree2525"
```

### Inserir passagem de plantão
```bash
curl -X POST "http://localhost:3000/passagem-plantao?api_key=Je@nfree2525" \
  -H "Content-Type: application/json" \
  -d '{
    "cod_animal": "1867",
    "cod_internacao": "2044",
    "responsavel": "fernando barreto",
    "observacao": "Texto da passagem de plantão que será inserido no editor rich text"
  }'
```

### Visualizar o navegador durante o processo
```bash
curl -X POST "http://localhost:3000/passagem-plantao?api_key=Je@nfree2525&show=true" \
  -H "Content-Type: application/json" \
  -d '{
    "cod_animal": "1867",
    "cod_internacao": "2044",
    "responsavel": "fernando barreto",
    "observacao": "Texto da passagem de plantão que será inserido no editor rich text"
  }'
```

## Notas Importantes

1. A API mantém uma única instância do navegador para todas as requisições, melhorando o desempenho.
2. Após 6 horas de inatividade, a sessão do navegador é encerrada automaticamente.
3. O navegador é reiniciado automaticamente após 12 horas de uso contínuo.
4. Existe um limite de tentativas para login e navegação para evitar loops infinitos.
5. Após cada operação, a API navega para o dashboard para evitar conflitos entre requisições.
