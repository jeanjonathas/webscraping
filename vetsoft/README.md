# API de Agendamentos VetSoft

API para consulta automática de agendamentos do sistema VetSoft.

## Configuração

1. Clone o repositório
2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` baseado no `.env.example`:
```bash
cp .env.example .env
```

4. Configure as credenciais no arquivo `.env`:
```env
VETSOFT_USERNAME=seu_usuario
VETSOFT_PASSWORD=sua_senha
SERVER_PORT=3000
```

## Executando a API

Para iniciar a API em modo de desenvolvimento:
```bash
npm run dev
```

## Endpoints

### GET /agendamentos

Retorna os agendamentos do dia atual ou de uma data específica.

#### Parâmetros Query

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| data | string | (Opcional) Data no formato DD/MM/YYYY. Se não fornecido, retorna os agendamentos do dia atual. |

#### Exemplo de Requisição

Para agendamentos do dia atual:
```bash
curl "http://localhost:3000/agendamentos" | json_pp
```

Para agendamentos de uma data específica:
```bash
curl "http://localhost:3000/agendamentos?data=09/04/2025" | json_pp
```

#### Exemplo de Resposta

```json
{
  "success": true,
  "data": [
    {
      "situacao": "Agendado",
      "entrada": "09/04 08:00",
      "entrega": "08:30",
      "pet": {
        "nome": "Rex",
        "codigo": "1234"
      },
      "cliente": {
        "nome": "João Silva",
        "codigo": "5678"
      },
      "servicos": [
        "Banho",
        "Tosa"
      ]
    }
  ]
}
```

#### Campos da Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| success | boolean | Indica se a requisição foi bem-sucedida |
| data | array | Lista de agendamentos |
| situacao | string | Status do agendamento (ex: "Agendado", "Entregue") |
| entrada | string | Data e hora de entrada no formato "DD/MM HH:mm" |
| entrega | string | Hora prevista de entrega no formato "HH:mm" |
| pet.nome | string | Nome do pet |
| pet.codigo | string | Código do pet no sistema |
| cliente.nome | string | Nome do cliente |
| cliente.codigo | string | Código do cliente no sistema |
| servicos | array | Lista de serviços agendados |

#### Possíveis Erros

```json
{
  "success": false,
  "error": "Mensagem de erro"
}
```

## Limitações

- A API só permite consultar agendamentos do mês atual ou do próximo mês
- É necessário ter credenciais válidas do sistema VetSoft
- A API não permite criar, modificar ou cancelar agendamentos

## Tecnologias Utilizadas

- Node.js
- TypeScript
- Express
- Playwright
- dotenv
