import React, { useState, ChangeEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do Supabase com o schema correto
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || '',
  {
    db: {
      schema: 'dranimal'
    }
  }
);

interface Animal {
  codigo: string;
  nome: string;
  especie: string;
  raca: string;
  sexo: string;
  data_nascimento: string | null;
  data_cadastro: string;
  tutor_codigo: string;
  data_obito?: string | null;
  codigo_internacao?: string | null;
}

interface ExcelRow {
  'Código': string;
  'Nome': string;
  'Espécie': string;
  'Raça': string;
  'Sexo': string;
  'Data Nascimento': string;
  'Data Cadastro': string;
  'Código Tutor': string;
  'Nome Tutor': string;
  'Data Óbito'?: string;
  'Código Internação'?: string;
}

const ImportarAnimais: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalProcessados, setTotalProcessados] = useState(0);
  const [totalSucesso, setTotalSucesso] = useState(0);
  const [totalErros, setTotalErros] = useState(0);

  const processarExcel = async (file: File) => {
    setLoading(true);
    setMessage('');
    setTotalProcessados(0);
    setTotalSucesso(0);
    setTotalErros(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      let processados = 0;
      let sucessos = 0;
      let erros = 0;

      for (const row of jsonData) {
        processados++;
        setTotalProcessados(processados);

        try {
          // Verificar se o tutor existe
          const { error: tutorError } = await supabase
            .from('clientes')
            .select('codigo')
            .eq('codigo', row['Código Tutor'])
            .single();

          if (tutorError) {
            console.warn(`Tutor com código ${row['Código Tutor']} não encontrado. Erro: ${tutorError.message}`);
          }

          const animal: Animal = {
            codigo: row['Código'] || '',
            nome: row['Nome'] || '',
            especie: row['Espécie'] || '',
            raca: row['Raça'] || '',
            sexo: row['Sexo'] || '',
            data_nascimento: row['Data Nascimento'] || null,
            data_cadastro: row['Data Cadastro'] || '',
            tutor_codigo: row['Código Tutor'] || '',
            data_obito: row['Data Óbito'] || null,
            codigo_internacao: row['Código Internação'] || null
          };

          const { error } = await supabase
            .from('animais')
            .insert([animal]);

          if (error) throw error;
          
          sucessos++;
          setTotalSucesso(sucessos);
        } catch (error: any) {
          console.error(`Erro ao processar animal ${row['Nome']}: ${error.message}`);
          erros++;
          setTotalErros(erros);
        }
      }

      setMessage(`Importação concluída. ${sucessos} animais importados com sucesso. ${erros} erros.`);
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
      <h1 className="text-2xl font-bold mb-4">Importar Animais</h1>
      
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
        
        {loading && (
          <div className="mt-4 p-3 bg-blue-100 text-blue-700 rounded">
            Processando... {totalProcessados} animais ({totalSucesso} com sucesso, {totalErros} com erro)
          </div>
        )}
        
        {message && (
          <div className={`mt-4 p-3 rounded ${message.includes('Erro') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportarAnimais;
