import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-data-folder',
      configureServer(server) {
        server.middlewares.use('/data', (req, res, next) => {
          // Rewrite /data/* requests to serve from data/ folder
          req.url = req.url || '/'
          const filePath = resolve(__dirname, 'data', req.url)
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json')
            fs.createReadStream(filePath).pipe(res)
          } else {
            next()
          }
        })
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  publicDir: 'public',
})
