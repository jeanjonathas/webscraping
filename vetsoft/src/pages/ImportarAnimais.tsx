import React, { useState, ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

interface Cliente {
  codigo: string;
  nome: string;
  cpf_cnpj: string;
  contatos: string;
  endereco: string;
  data_cadastro: string;
  usuario_cadastro: string;
  data_atualizacao: string;
  usuario_atualizacao: string;
  grupos: string[];
  origem: string;
  situacao: string;
}

interface ExcelRow {
  'Cód': string;
  'Nome': string;
  'CPF/CNPJ': string;
  'Contatos': string;
  'Endereço': string;
  'Cadastro': string;
  'Usu Cadastrou': string;
  'Atualização': string;
  'Usu Atualizou': string;
  'Grupo(s)': string;
  'Origem': string;
  'Situação': string;
}

const ImportarClientes: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const processarExcel = async (file: File) => {
    setLoading(true);
    setMessage('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      for (const row of jsonData) {
        const cliente: Cliente = {
          codigo: row['Cód'] || '',
          nome: row['Nome'] || '',
          cpf_cnpj: row['CPF/CNPJ'] || '',
          contatos: row['Contatos'] || '',
          endereco: row['Endereço'] || '',
          data_cadastro: row['Cadastro'] || '',
          usuario_cadastro: row['Usu Cadastrou'] || '',
          data_atualizacao: row['Atualização'] || '',
          usuario_atualizacao: row['Usu Atualizou'] || '',
          grupos: (row['Grupo(s)'] || '').split(',').filter(Boolean),
          origem: row['Origem'] || '',
          situacao: row['Situação'] || ''
        };

        const { error } = await supabase
          .from('dranimal.clientes')
          .insert([cliente]);

        if (error) throw error;
      }

      setMessage('Importação concluída com sucesso!');
    } catch (error: any) {
      setMessage(`Erro na importação: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSubmit = () => {
    if (selectedFile) {
      processarExcel(selectedFile);
    } else {
      setMessage('Por favor, selecione um arquivo Excel para importar.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Importar Clientes</h1>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="mb-4"
        />
        
        <div className="mt-4">
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedFile}
            className={`px-4 py-2 rounded ${
              loading || !selectedFile
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {loading ? 'Importando...' : 'Enviar'}
          </button>
        </div>
        
        {message && (
          <div className={`mt-4 p-3 rounded ${message.includes('Erro') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportarClientes;
