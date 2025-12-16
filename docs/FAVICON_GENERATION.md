# Favicon e Open Graph Image Generation

Este documento explica como gerar os arquivos PNG do favicon e da imagem Open Graph a partir dos arquivos SVG.

## Pré-requisitos

Instale o `sharp` para gerar as imagens PNG:

```bash
npm install --save-dev sharp
```

## Gerar Favicons

Execute o script para gerar todos os tamanhos de favicon:

```bash
node scripts/generate-favicons.js
```

Isso irá gerar:
- `favicon-16x16.png` (16x16 pixels)
- `favicon-32x32.png` (32x32 pixels)
- `apple-touch-icon.png` (180x180 pixels)

## Gerar Open Graph Image

Execute o script para gerar a imagem Open Graph:

```bash
node scripts/generate-og-image.js
```

Isso irá gerar:
- `og-image.png` (1200x630 pixels)

## Nota

Os arquivos SVG já funcionam bem em navegadores modernos e muitas plataformas de redes sociais. Os PNGs são opcionais para melhor compatibilidade com plataformas mais antigas.

Se preferir, você pode usar uma ferramenta online como:
- https://realfavicongenerator.net/ (para favicons)
- https://www.opengraph.xyz/ (para preview de Open Graph)























