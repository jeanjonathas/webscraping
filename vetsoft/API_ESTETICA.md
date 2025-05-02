# Tutorial: Endpoint de Agendamentos de Estética

Este documento explica como utilizar o endpoint de agendamentos de estética da API VetSoft.

## Visão Geral

O endpoint de estética permite consultar os agendamentos de estética do VetSoft, com opções para filtrar por data específica e período (mês atual ou próximo mês).

**URL Base:** `http://localhost:3000/estetica` ou `https://apivetsoft.supervet.app/estetica` (em produção)

## Autenticação

Todas as requisições devem incluir a API Key para autenticação. Você pode fornecer a API Key de duas formas:

1. **No cabeçalho HTTP:**
   ```
   x-api-key: Je@nfree2525
   ```

2. **Como parâmetro de query:**
   ```
   ?api_key=Je@nfree2525
   ```

## Parâmetros

| Parâmetro | Tipo   | Descrição                                                                                                |
|-----------|--------|----------------------------------------------------------------------------------------------------------|
| data      | string | (Opcional) Data específica para filtrar no formato DD/MM/YYYY. Se não informado, retorna todos os agendamentos. |
| periodo   | string | (Opcional) Período a ser consultado: 'atual' (padrão), 'proximo', 'todos' ou um intervalo de datas no formato 'DD/MM/AAAA-DD/MM/AAAA'. |
| show      | boolean| (Opcional) Se true, exibe o navegador durante a execução (útil para debug).                              |

## Exemplos de Uso

### 1. Consultar todos os agendamentos do mês atual

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525" | jq
```

### 2. Consultar agendamentos de uma data específica

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525&data=02/05/2025" | jq
```

### 3. Consultar agendamentos do próximo mês

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525&periodo=proximo" | jq
```

### 4. Visualizar apenas informações resumidas dos agendamentos

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525&data=02/05/2025" | jq '.agendamentos[] | {hora: .hora_inicio, animal: .animal.nome, cliente: .cliente.nome}'
```

### 5. Visualizar o navegador durante a execução (para debug)

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525&data=02/05/2025&show=true" | jq
```

### 6. Consultar agendamentos em um intervalo de datas personalizado

```bash
curl -s "http://localhost:3000/estetica?api_key=Je@nfree2525&periodo=01/05/2025-07/05/2025" | jq
```

## Estrutura da Resposta

A resposta é um objeto JSON com a seguinte estrutura:

```json
{
  "success": true,
  "periodo": "Mês atual",
  "data_filtro": "02/05/2025",
  "total": 9,
  "agendamentos": [
    {
      "id": "8612",
      "data": "02/05/2025",
      "hora_inicio": "09:00",
      "hora_termino": "09:30",
      "cliente": {
        "id": "633",
        "nome": "Luiz Fernando",
        "endereco": "Carazinho",
        "numero": "",
        "bairro": "Petrópolis",
        "complemento": "",
        "cep": "90460-190",
        "em_aberto": "0.00",
        "whatsapp": "51980259133"
      },
      "animal": {
        "id": "715",
        "nome": "Ziggy",
        "raca": "",
        "observacoes": ""
      },
      "situacao": "Agendado",
      "servicos": [
        "Banho"
      ],
      "transporte": "Tutor Leva e Busca",
      "recorrencia": "AVULSO",
      "observacoes": "Adicionar Obs"
    }
    // ... mais agendamentos
  ]
}
```

## Campos da Resposta

### Campos Principais

| Campo       | Tipo    | Descrição                                                       |
|-------------|---------|------------------------------------------------------------------|
| success     | boolean | Indica se a requisição foi bem-sucedida.                         |
| periodo     | string  | Período consultado: "Mês atual" ou "Próximo mês".                |
| data_filtro | string  | Data específica utilizada como filtro, ou "todas" se não filtrado.|
| total       | number  | Número total de agendamentos encontrados.                        |
| agendamentos| array   | Lista de agendamentos encontrados.                               |

### Campos do Agendamento

| Campo        | Tipo    | Descrição                                                      |
|--------------|---------|----------------------------------------------------------------|
| id           | string  | Identificador único do agendamento.                            |
| data         | string  | Data do agendamento no formato DD/MM/YYYY.                     |
| hora_inicio  | string  | Horário de início do agendamento.                              |
| hora_termino | string  | Horário de término do agendamento.                             |
| cliente      | object  | Informações do cliente (id, nome, endereço, contato, etc.).    |
| animal       | object  | Informações do animal (id, nome, raça, observações).           |
| situacao     | string  | Situação atual do agendamento (ex: "Agendado").                |
| servicos     | array   | Lista de serviços agendados (ex: ["Banho", "Tosa"]).           |
| transporte   | string  | Tipo de transporte (ex: "Tutor Leva e Busca").                 |
| recorrencia  | string  | Tipo de recorrência do agendamento (ex: "AVULSO", "S", "Q").   |
| observacoes  | string  | Observações específicas do agendamento.                         |

## Códigos de Erro

| Código | Descrição                                                                     |
|--------|-------------------------------------------------------------------------------|
| 401    | API Key não fornecida ou inválida.                                            |
| 500    | Erro interno do servidor ao processar a requisição.                           |
| 503    | Não foi possível adquirir o semáforo para a operação (servidor ocupado).      |

## Notas Importantes

1. O endpoint utiliza web scraping para extrair os dados do VetSoft, portanto pode levar alguns segundos para responder.
2. Devido ao sistema de semáforo, apenas uma requisição pode ser processada por vez.
3. Para melhor desempenho, evite fazer muitas requisições simultâneas.
4. O parâmetro `show=true` deve ser usado apenas para debug, pois afeta o desempenho.
