import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { createLogger } from '@/lib/logger';
const log = createLogger('BlingCallback');

type CallbackStatus = "loading" | "success" | "error";

const BlingCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const exchangeCode = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      // Handle error from Bling
      if (error) {
        log.error("Bling OAuth error", { error, errorDescription });
        setStatus("error");
        setErrorMessage(errorDescription || error || "Erro ao conectar com Bling");
        return;
      }

      // Validate required params
      if (!code || !state) {
        setStatus("error");
        setErrorMessage("Parâmetros de autenticação ausentes");
        return;
      }

      try {
        // Exchange code for tokens via edge function
        // CRITICAL: This must happen immediately as Bling code expires in 1 minute
        const { data, error: exchangeError } = await supabase.functions.invoke("bling-oauth", {
          body: {
            action: "exchange",
            code,
            state,
          },
        });

        if (exchangeError) {
          throw new Error(exchangeError.message || "Erro ao trocar código");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        setStatus("success");
        toast.success("Bling conectado com sucesso!");

        // Redirect to integrations after short delay
        setTimeout(() => {
          navigate("/integrations?bling_success=true");
        }, 1500);

      } catch (err) {
        log.error("Bling callback error:", err);
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Erro ao processar autenticação");
      }
    };

    exchangeCode();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <h2 className="text-lg font-semibold text-foreground">Conectando ao Bling...</h2>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Aguarde enquanto processamos a autenticação
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-4">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Conexão realizada!</h2>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Seu Bling foi conectado com sucesso. Redirecionando...
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Erro na conexão</h2>
              <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
                {errorMessage}
              </p>
              <Button 
                variant="outline" 
                className="mt-6"
                onClick={() => navigate("/integrations")}
              >
                Voltar para Integrações
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlingCallback;
