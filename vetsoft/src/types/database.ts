export interface Database {
  public: {
    Tables: {
      clientes: {
        Row: {
          id: number
          codigo: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          codigo: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          nome?: string
          updated_at?: string
        }
      }
      animais: {
        Row: {
          id: number
          codigo: string
          nome: string
          cliente_id: number
          created_at: string
          updated_at: string
        }
        Insert: {
          codigo: string
          nome: string
          cliente_id: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          nome?: string
          cliente_id?: number
          updated_at?: string
        }
      }
    }
  }
}
