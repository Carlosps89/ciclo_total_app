import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function refreshAWSSession(profile: string = "rumo-sso"): Promise<boolean> {
    console.log(`[Auth] Iniciando tentativa de refresh para perfil: ${profile}`);
    try {
        // Tenta rodar o login de forma não interativa (ou o mais automático possível no Mac)
        // No Mac, o aws sso login tenta abrir o browser padrão.
        const { stdout, stderr } = await execAsync(`aws sso login --profile ${profile}`);
        console.log(`[Auth] Saída SSO Login: ${stdout}`);
        if (stderr) console.warn(`[Auth] Aviso SSO Login: ${stderr}`);
        
        // Pequena espera para que o arquivo de credenciais seja atualizado
        await new Promise(resolve => setTimeout(resolve, 3000));
        return true;
    } catch (error) {
        console.error(`[Auth] Erro ao tentar renovar sessão AWS:`, error);
        return false;
    }
}
