export type Agendamento = {
  situacao: string;
  entrada: string;
  entrega: string;
  pet: {
    nome: string;
    codigo: string;
  };
  cliente: {
    nome: string;
    codigo: string;
  };
  servicos: string[];
};
