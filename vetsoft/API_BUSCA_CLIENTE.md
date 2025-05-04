# API de Busca de Cliente - VetSoft

Esta documentação descreve o endpoint de busca de cliente implementado na API VetSoft.

## Endpoint: `/busca-cliente`

### Método: GET

### Parâmetros

| Parâmetro | Tipo    | Obrigatório | Descrição                                            |
|-----------|---------|-------------|------------------------------------------------------|
| termo     | string  | Sim         | Termo de busca (nome do cliente, animal ou telefone) |
| show      | boolean | Não         | Se `true`, mostra o navegador durante a execução     |
| api_key   | string  | Sim         | Chave de API para autenticação                       |

### Exemplo de Requisição

```
GET /busca-cliente?termo=João&api_key=Je@nfree2525
```

ou

```
GET /busca-cliente?termo=21995555060&api_key=Je@nfree2525
```

### Cabeçalhos

Você também pode enviar a API Key via cabeçalho HTTP:

```
x-api-key: Je@nfree2525
```

### Resposta

A resposta será um objeto JSON com os seguintes campos:

```json
{
  "success": true,
  "termo_busca": "João",
  "total": 2,
  "resultados": [
    {
      "id": "1",
      "codigo": "123",
      "nome": "João Silva",
      "cpf_cnpj": "123.456.789-00",
      "telefone": "(21) 99555-5060",
      "email": "joao@exemplo.com",
      "endereco": "Rua Exemplo, 123",
      "data_cadastro": "01/01/2023",
      "situacao": "ATIVO",
      "animais": [
        {
          "codigo": "456",
          "nome": "Rex"
        }
      ]
    },
    {
      "id": "2",
      "codigo": "124",
      "nome": "João Pereira",
      "cpf_cnpj": "987.654.321-00",
      "telefone": "(21) 98888-7777",
      "email": "joaop@exemplo.com",
      "endereco": "Av. Teste, 456",
      "data_cadastro": "15/03/2023",
      "situacao": "ATIVO",
      "animais": [
        {
          "codigo": "789",
          "nome": "Totó"
        },
        {
          "codigo": "790",
          "nome": "Mimi"
        }
      ]
    }
  ]
}
```

### Resposta em caso de erro

```json
{
  "success": false,
  "error": "Mensagem de erro detalhada"
}
```

### Códigos de Status

- `200 OK`: Requisição bem-sucedida
- `400 Bad Request`: Parâmetros inválidos ou ausentes
- `401 Unauthorized`: API Key não fornecida
- `403 Forbidden`: API Key inválida
- `500 Internal Server Error`: Erro interno do servidor
- `503 Service Unavailable`: Não foi possível adquirir o semáforo para a operação

## Observações

- A busca é realizada exatamente como no sistema VetSoft, permitindo encontrar clientes por nome, nome do animal ou telefone.
- O parâmetro `show=true` é útil para debug, pois permite visualizar o navegador durante a execução.
- A API utiliza o sistema de semáforo para garantir que apenas uma requisição use o navegador por vez.
- Recomenda-se usar termos de busca específicos para obter resultados mais precisos.
