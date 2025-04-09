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

### GET /agendamentos/periodo

Retorna os agendamentos dentro de um período específico, com opção de filtrar por animal. Este endpoint permite buscar agendamentos em um intervalo de datas, útil para verificar quando um animal específico tem agendamentos futuros.

#### Parâmetros Query

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| dataInicial | string | (Obrigatório) Data inicial no formato DD/MM/YYYY |
| dataFinal | string | (Obrigatório) Data final no formato DD/MM/YYYY |
| codAnimal | string | (Opcional) Código do animal para filtrar apenas seus agendamentos |

#### Exemplo de Requisição

Para todos os agendamentos em um período:
```bash
curl "http://localhost:3000/agendamentos/periodo?dataInicial=09/04/2025&dataFinal=15/04/2025" | json_pp
```

Para agendamentos de um animal específico em um período:
```bash
curl "http://localhost:3000/agendamentos/periodo?dataInicial=09/04/2025&dataFinal=15/04/2025&codAnimal=4666" | json_pp
```

#### Exemplo de Resposta Completa

```json
{
  "success": true,
  "data": [
    {
      "situacao": "Agendado",
      "entrada": "09/04 08:00",
      "entrega": "08:30",
      "pet": {
        "nome": "Princesa",
        "codigo": "4666"
      },
      "cliente": {
        "nome": "Mariane de Quadros Dutra",
        "codigo": "2808"
      },
      "servicos": [
        "Banho",
        "Tosa"
      ]
    },
    {
      "situacao": "Agendado",
      "entrada": "11/04 10:00",
      "entrega": "10:30",
      "pet": {
        "nome": "Sofia",
        "codigo": "877"
      },
      "cliente": {
        "nome": "Tylla",
        "codigo": "775"
      },
      "servicos": [
        "Banho"
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

## Funcionamento do Calendário

A API utiliza um sistema inteligente para selecionar datas no calendário duplo do VetSoft:

1. O calendário da esquerda mostra o mês atual
2. O calendário da direita mostra o próximo mês
3. Para datas no mês atual, a API usa o calendário da esquerda
4. Para datas no próximo mês, a API usa o calendário da direita
5. A API remove zeros à esquerda dos dias (ex: "09" vira "9") para corresponder ao formato do calendário
6. Células com a classe "off" são ignoradas pois pertencem ao mês anterior/próximo
7. Para buscas por período, a API:
   - Seleciona a data inicial no calendário da esquerda
   - Seleciona a data final no calendário apropriado (esquerda ou direita) baseado no mês

## Limitações

- A API só permite consultar agendamentos do mês atual ou do próximo mês
- É necessário ter credenciais válidas do sistema VetSoft
- A API não permite criar, modificar ou cancelar agendamentos
- O período máximo de consulta é limitado a dois meses consecutivos

## Tecnologias Utilizadas

- Node.js
- TypeScript
- Express
- Playwright
- dotenv
