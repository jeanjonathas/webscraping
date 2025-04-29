import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import agendamentosRouter from './routes/consulta';
import cadastroRouter from './routes/cadastro';
import animaisRouter from './routes/animais';
import configRouter from './routes/config';
import importacaoRouter from './routes/importacao';
import internacaoRouter from './routes/internacao';
import clienteRouter from './routes/cliente';
import { apiKeyAuth } from './middlewares/apiKeyAuth';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.SERVER_PORT || 3000;

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'dranimal'
  }
});

// Configuração do Multer para upload de arquivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // limite de 10MB
  }
});

// Função para formatar datas
function formatarData(dataStr: string | null | undefined): string | null {
  if (!dataStr || dataStr === '---' || dataStr === '') return null;
  
  try {
    // Tenta converter para formato ISO
    const partes = dataStr.split(' ');
    const data = partes[0].split('/');
    const hora = partes[1] ? partes[1].split(':') : ['00', '00'];
    
    // Ajusta o ano para formato completo se for abreviado
    let ano = data[2];
    if (ano.length === 2) {
      ano = '20' + ano;
    }
    
    // Cria data no formato ISO
    const dataISO = `${ano}-${data[1].padStart(2, '0')}-${data[0].padStart(2, '0')}T${hora[0].padStart(2, '0')}:${hora[1].padStart(2, '0')}:00`;
    return dataISO;
  } catch (e) {
    console.error('Erro ao formatar data:', dataStr, e);
    return null;
  }
}

// Função para formatar array
function formatarArray(valor: string | null | undefined): string[] {
  if (!valor || valor === '---' || valor === '') return [];
  return valor.split(',').filter(item => item && item !== '---');
}

// Configuração do Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configurar o Express para formatar JSON de forma legível
app.set('json spaces', 2);

// Rotas da API protegidas com API Key
app.use('/agendamentos', apiKeyAuth, agendamentosRouter);
app.use('/cadastro', apiKeyAuth, cadastroRouter);
app.use('/animais', apiKeyAuth, animaisRouter);
app.use('/config', apiKeyAuth, configRouter);
app.use('/importacao', apiKeyAuth, importacaoRouter);
app.use('/internacao', apiKeyAuth, internacaoRouter);
app.use('/cliente', apiKeyAuth, clienteRouter);

// Página para exportar animais
app.get('/exportar-animais', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/exportar-animais.html'));
});

// Página para importar animais
app.get('/importar-animais', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/importar-animais.html'));
});

// API para importação de clientes
app.post('/api/importar-clientes', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    // Ler o arquivo Excel
    const buffer = req.file.buffer;
    const workbook = XLSX.read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

    console.log('Dados do Excel:', jsonData[0]); // Log para debug

    // Contador de registros inseridos
    let registrosInseridos = 0;

    // Processar cada linha do Excel
    for (const row of jsonData) {
      // Extrair código do cliente
      const codigo = row['Cód']?.toString() || 
                    row['Código']?.toString() || 
                    row['#']?.toString() || '';
      
      const cliente = {
        codigo: codigo,
        nome: row['Nome']?.toString() || '',
        cpf_cnpj: row['CPF/CNPJ']?.toString() || row['CPF']?.toString() || row['CNPJ']?.toString() || '',
        contatos: row['Contatos']?.toString() || row['Contato']?.toString() || row['Telefone']?.toString() || '',
        endereco: row['Endereço']?.toString() || row['Endereco']?.toString() || '',
        data_cadastro: formatarData(row['Cadastro']?.toString() || row['Data Cadastro']?.toString()),
        data_atualizacao: formatarData(row['Atualização']?.toString() || row['Data Atualização']?.toString()),
        grupos: formatarArray(row['Grupo(s)']?.toString() || row['Grupos']?.toString()),
        origem: row['Origem']?.toString() || 'Importação Excel',
        situacao: row['Situação']?.toString() || row['Situacao']?.toString() || 'ATIVO'
      };

      console.log('Inserindo cliente:', cliente);

      // Inserir diretamente na tabela usando o cliente Supabase
      try {
        console.log('Tentando inserir na tabela clientes usando o cliente Supabase');
        
        const { data, error } = await supabase
          .from('clientes')
          .insert([{
            codigo: cliente.codigo,
            nome: cliente.nome,
            cpf_cnpj: cliente.cpf_cnpj,
            contatos: cliente.contatos,
            endereco: cliente.endereco,
            data_cadastro: cliente.data_cadastro,
            data_atualizacao: cliente.data_atualizacao,
            grupos: cliente.grupos,
            origem: cliente.origem,
            situacao: cliente.situacao
          }])
          .select();

        if (error) {
          console.error('Erro ao inserir cliente:', error);
          continue;
        }

        console.log('Cliente inserido com sucesso:', data);
        registrosInseridos++;
      } catch (insertError: any) {
        console.error('Exceção ao inserir cliente:', insertError.message, insertError);
        continue;
      }
    }

    return res.json({ 
      success: true, 
      message: `Importação concluída com sucesso! ${registrosInseridos} registros importados.` 
    });
  } catch (error: any) {
    console.error('Erro na importação:', error);
    return res.status(500).json({ 
      error: `Erro ao processar o arquivo: ${error.message}` 
    });
  }
});

// Rota para importação de clientes
app.get('/importar-clientes', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Importar Clientes</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100">
        <div class="container mx-auto p-4">
          <h1 class="text-2xl font-bold mb-4">Importar Clientes</h1>
          
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-white">
            <form id="uploadForm" enctype="multipart/form-data">
              <input
                type="file"
                id="fileInput"
                name="file"
                accept=".xlsx,.xls"
                class="mb-4"
              />
              
              <div class="mt-4">
                <button
                  type="submit"
                  id="submitButton"
                  class="px-4 py-2 rounded bg-gray-400 cursor-not-allowed"
                  disabled
                >
                  Enviar
                </button>
              </div>
            </form>
            
            <div id="messageContainer" class="mt-4 p-3 rounded hidden"></div>
          </div>
        </div>
        
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            const fileInput = document.getElementById('fileInput');
            const submitButton = document.getElementById('submitButton');
            const uploadForm = document.getElementById('uploadForm');
            const messageContainer = document.getElementById('messageContainer');
            
            let isLoading = false;
            
            fileInput.addEventListener('change', function() {
              if (fileInput.files.length > 0) {
                submitButton.disabled = false;
                submitButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
                submitButton.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
              } else {
                submitButton.disabled = true;
                submitButton.classList.add('bg-gray-400', 'cursor-not-allowed');
                submitButton.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'text-white');
              }
            });
            
            uploadForm.addEventListener('submit', async function(e) {
              e.preventDefault();
              
              if (isLoading || !fileInput.files.length) return;
              
              isLoading = true;
              submitButton.disabled = true;
              submitButton.textContent = 'Importando...';
              submitButton.classList.add('bg-gray-400', 'cursor-not-allowed');
              submitButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
              
              const formData = new FormData();
              formData.append('file', fileInput.files[0]);
              
              try {
                const response = await fetch('/api/importar-clientes', {
                  method: 'POST',
                  body: formData
                });
                
                const result = await response.json();
                
                messageContainer.classList.remove('hidden', 'bg-red-100', 'bg-green-100', 'text-red-700', 'text-green-700');
                
                if (response.ok) {
                  messageContainer.classList.add('bg-green-100', 'text-green-700');
                  messageContainer.textContent = result.message || 'Importação concluída com sucesso!';
                } else {
                  messageContainer.classList.add('bg-red-100', 'text-red-700');
                  messageContainer.textContent = result.error || 'Erro na importação.';
                }
              } catch (error) {
                messageContainer.classList.remove('hidden');
                messageContainer.classList.add('bg-red-100', 'text-red-700');
                messageContainer.textContent = 'Erro ao enviar o arquivo: ' + error.message;
              } finally {
                isLoading = false;
                submitButton.textContent = 'Enviar';
                
                if (fileInput.files.length > 0) {
                  submitButton.disabled = false;
                  submitButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
                  submitButton.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
                }
              }
            });
          });
        </script>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
