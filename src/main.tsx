import { StrictMode } from 'react';
import ReactDOM from 'react-dom';
import { pimTheme } from 'akeneo-design-system';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import App from './App';

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
`;

if (!document.getElementById('root')) {
  document.body.innerHTML = '<div id="root"></div>';
}

ReactDOM.render(
  <StrictMode>
    <ThemeProvider theme={pimTheme}>
      <GlobalStyle />
      <App />
    </ThemeProvider>
  </StrictMode>,
  document.getElementById('root')
);
