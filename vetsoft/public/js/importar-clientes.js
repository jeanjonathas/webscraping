// Script para gerenciar a importação de clientes
(function() {
  // Quando o DOM estiver carregado
  document.addEventListener('DOMContentLoaded', function() {
    // Referências aos elementos do DOM
    const fileInput = document.querySelector('input[type="file"]');
    const submitButton = document.querySelector('button');
    const messageContainer = document.querySelector('div[class*="mt-4 p-3 rounded"]') || 
                            document.createElement('div');
    
    let selectedFile = null;
    let isLoading = false;
    
    // Função para atualizar o estado do botão
    function updateButtonState() {
      if (submitButton) {
        submitButton.disabled = isLoading || !selectedFile;
        
        if (isLoading || !selectedFile) {
          submitButton.classList.add('bg-gray-400', 'cursor-not-allowed');
          submitButton.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'text-white');
        } else {
          submitButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
          submitButton.classList.add('bg-blue-500', 'hover:bg-blue-600', 'text-white');
        }
        
        submitButton.textContent = isLoading ? 'Importando...' : 'Enviar';
      }
    }
    
    // Função para mostrar mensagens
    function showMessage(message, isError = false) {
      if (!messageContainer.parentNode) {
        const container = document.querySelector('.border-2.border-dashed');
        if (container) {
          container.appendChild(messageContainer);
        }
      }
      
      messageContainer.className = `mt-4 p-3 rounded ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
      messageContainer.textContent = message;
      messageContainer.style.display = 'block';
    }
    
    // Função para processar o arquivo Excel
    async function processarExcel(file) {
      isLoading = true;
      updateButtonState();
      
      try {
        // Criar um FormData para enviar o arquivo
        const formData = new FormData();
        formData.append('file', file);
        
        // Enviar o arquivo para o servidor
        const response = await fetch('/api/importar-clientes', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
          showMessage('Importação concluída com sucesso!');
        } else {
          showMessage(`Erro na importação: ${result.error || 'Erro desconhecido'}`, true);
        }
      } catch (error) {
        showMessage(`Erro na importação: ${error.message || 'Erro desconhecido'}`, true);
      } finally {
        isLoading = false;
        updateButtonState();
      }
    }
    
    // Adicionar event listeners
    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        selectedFile = e.target.files[0];
        updateButtonState();
      });
    }
    
    if (submitButton) {
      submitButton.addEventListener('click', function() {
        if (selectedFile) {
          processarExcel(selectedFile);
        } else {
          showMessage('Por favor, selecione um arquivo Excel para importar.', true);
        }
      });
    }
    
    // Inicializar o estado do botão
    updateButtonState();
    console.log('Cliente de importação inicializado');
  });
})();
