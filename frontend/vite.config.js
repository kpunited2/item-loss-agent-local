import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://127.0.0.1:8257'
const proxyRoute = { target: BACKEND, changeOrigin: true }

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['all'],
    proxy: {
      '/upload':                    proxyRoute,
      '/verify_email_and_code':     proxyRoute,
      '/enter_admin_page':          proxyRoute,
      '/check_job_status':          proxyRoute,
      '/run_pipeline':              proxyRoute,
      '/get_added_context':         proxyRoute,
      '/write_added_context':       proxyRoute,
      '/generate_access_code':      proxyRoute,
      '/get_items':                 proxyRoute,
      '/update_items':              proxyRoute,
      '/export_items':              proxyRoute,
      '/regenerate_forgotten_code': proxyRoute,
      '/get_claims_and_inventory':  proxyRoute,
      '/add_claim':                 proxyRoute,
      '/request_account':           proxyRoute,
      '/files':                     proxyRoute,
      '/ping':                      proxyRoute,
      '/set_invite_code':           proxyRoute,
      '/remove_invite_code':        proxyRoute,
      '/set_password':              proxyRoute,
      '/upload_text_descriptions':  proxyRoute,
      '/get_local_network_ip':      proxyRoute,
      '/get_room_types':            proxyRoute,
      '/config/gemini-key-status':  proxyRoute,
      '/config/gemini-key':         proxyRoute,
    }
  }
})