import { EmailContent } from './types';
import { generateBlockHTML } from './htmlBlockGenerators';

export function generateEmailHTML(content: EmailContent, preheader?: string): string {
  const { blocks, globalStyles = {} } = content;

  const {
    bodyBackground = '#f4f4f4',
    contentWidth = '600px',
    fontFamily = 'Arial, sans-serif',
    contentBackground = '#ffffff',
    linkColor = '#0066cc',
  } = globalStyles;

  const blocksHTML = blocks.map(block => generateBlockHTML(block).trim()).join('\n');

  const preheaderHTML = preheader
    ? `<div style="display:none;font-size:1px;color:${bodyBackground};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    a {
      color: ${linkColor};
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .mobile-padding {
        padding: 10px !important;
      }
      .mobile-hide {
        display: none !important;
      }
      .mobile-column {
        display: block !important;
        width: 100% !important;
        padding-right: 0 !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${bodyBackground}; font-family: ${fontFamily};">
  ${preheaderHTML}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="email-container" style="margin: 0 auto; width: ${contentWidth}; max-width: ${contentWidth}; background-color: ${contentBackground}; font-family: ${fontFamily};">
          ${blocksHTML}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
