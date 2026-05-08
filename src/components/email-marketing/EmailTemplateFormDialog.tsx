import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  EmailTemplateType,
} from "@/hooks/useEmailTemplates";
import { useEmailTemplate } from "@/hooks/useEmailSingle";
import { EmailEditor } from "./editor/EmailEditor";
import { EmailContent } from "./editor/types";
import type { Json } from "@/integrations/supabase/types";

const templateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  template_type: z.enum(["newsletter", "promotional", "reactivation", "launch", "relationship"]),
});

type TemplateFormData = z.infer<typeof templateSchema>;

interface EmailTemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string;
  defaultValues?: Partial<TemplateFormData>;
}

export function EmailTemplateFormDialog({
  open,
  onOpenChange,
  templateId,
  defaultValues,
}: EmailTemplateFormDialogProps) {
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const { data: existingTemplate } = useEmailTemplate(templateId);

  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [emailHTML, setEmailHTML] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'content'>('details');
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      template_type: "newsletter",
      ...defaultValues,
    },
  });

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      if (!templateId) {
        // Creating new template — reset everything
        form.reset({
          name: "",
          description: "",
          template_type: "newsletter",
          ...defaultValues,
        });
        setEmailContent(null);
        setEmailHTML('');
        setActiveTab('details');
        setIsDirty(false);
      }
    }
  }, [open, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (defaultValues) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form]);

  // Load existing template content AND form fields
  useEffect(() => {
    if (existingTemplate) {
      form.reset({
        name: existingTemplate.name || '',
        description: existingTemplate.description || '',
        template_type: (existingTemplate.template_type as TemplateFormData['template_type']) || 'newsletter',
      });
      if (existingTemplate.content_json) {
        setEmailContent(existingTemplate.content_json as unknown as EmailContent);
      }
      setEmailHTML(existingTemplate.content_html || '');
      setEditorKey(prev => prev + 1);
      setIsDirty(false);
    }
  }, [existingTemplate, form]);

  // Track dirtiness
  useEffect(() => {
    const subscription = form.watch(() => setIsDirty(true));
    return () => subscription.unsubscribe();
  }, [form]);

  const handleClose = useCallback((nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setShowCloseWarning(true);
      return;
    }
    onOpenChange(nextOpen);
  }, [isDirty, onOpenChange]);

  const handleForceClose = () => {
    setShowCloseWarning(false);
    setIsDirty(false);
    setActiveTab('details');
    form.reset();
    setEmailContent(null);
    setEmailHTML('');
    onOpenChange(false);
  };

  const onSubmit = async (data: TemplateFormData) => {
    try {
      const payload = {
        name: data.name,
        description: data.description,
        template_type: data.template_type,
        content_html: emailHTML,
        content_json: emailContent as unknown as Json,
      };

      const isSystemTemplate = existingTemplate?.is_system === true;

      if (templateId && !isSystemTemplate) {
        await updateMutation.mutateAsync({
          id: templateId,
          updates: payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setIsDirty(false);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handleEditorChange = (content: EmailContent, html: string) => {
    setEmailContent(content);
    setEmailHTML(html);
    setIsDirty(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {templateId ? "Editar Template" : "Novo Template"}
            </DialogTitle>
            <DialogDescription>
              Configure o template e crie o design
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Detalhes</TabsTrigger>
              <TabsTrigger value="content">Design</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6 overflow-y-auto max-h-[calc(95vh-200px)]">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Template *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Newsletter Padrão" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="template_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Template *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="newsletter">Newsletter</SelectItem>
                            <SelectItem value="promotional">Promocional</SelectItem>
                            <SelectItem value="reactivation">Reativação</SelectItem>
                            <SelectItem value="launch">Lançamento</SelectItem>
                            <SelectItem value="relationship">Relacionamento</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Descreva o propósito deste template"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Ajuda a identificar quando usar este template
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleClose(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab('content')}
                    >
                      Próximo: Design
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {templateId ? "Salvar Alterações" : "Criar Template"}
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="content" className="mt-6">
              <EmailEditor
                key={editorKey}
                initialContent={emailContent || undefined}
                onChange={handleEditorChange}
              />
              <div className="flex justify-end gap-3 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('details')}
                >
                  Voltar: Detalhes
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {templateId ? "Salvar Alterações" : "Criar Template"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseWarning} onOpenChange={setShowCloseWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas no template. Deseja descartar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
