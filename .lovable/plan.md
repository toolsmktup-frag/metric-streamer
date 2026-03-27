

## Plano: Adicionar botao "Voltar" na pagina de Configuracoes

### Mudanca unica

**`src/pages/UserSettings.tsx`**
- Importar `ArrowLeft` do lucide-react e `useNavigate` do react-router-dom
- Adicionar um botao "Voltar" acima do titulo `<h1>`, usando `navigate(-1)` para voltar a pagina anterior

