# Migração de privacidade local — Hábitos e Kaely

## Contrato vigente

Hábitos, registros de bem-estar, preferências da Kaely e lembretes são dados pessoais locais. O aplicativo grava essas informações exclusivamente no IndexedDB, com escopo por usuário e concurso. Elas não participam de `SYNC_COLLECTIONS`, não entram na outbox e são recusadas defensivamente pelo cliente de nuvem.

Coleções locais:

- `wellbeingHabits`
- `wellbeingLogs`

Prefixos de metadados locais:

- `personalized_habits_`
- `wellbeing_`
- `habit_`
- `kaely_`
- `local_notification_`

Aviso exibido ao aluno:

> Seus hábitos e horários ficam somente neste dispositivo e não são sincronizados com a nuvem. Se os dados do navegador forem apagados, este histórico será perdido.

## Auditoria opcional do legado remoto

Execute apenas em um ambiente explicitamente autorizado e primeiro faça somente a contagem:

```sql
select collection, count(*) as records
from public.progress_records
where collection in ('wellbeingHabits', 'wellbeingLogs')
group by collection
order by collection;
```

Metadados pessoais antigos podem ser contados separadamente:

```sql
select count(*) as personal_meta_records
from public.progress_records
where collection = 'meta'
  and (
    record_key like 'personalized_habits_%'
    or record_key like 'wellbeing_%'
    or record_key like 'habit_%'
    or record_key like 'kaely_%'
    or record_key like 'local_notification_%'
  );
```

## Limpeza seletiva opcional

Não execute esta limpeza automaticamente. Faça backup, confirme o projeto e obtenha autorização específica. A remoção deve atingir somente as linhas pessoais legadas:

```sql
delete from public.progress_records
where collection in ('wellbeingHabits', 'wellbeingLogs')
   or (
     collection = 'meta'
     and (
       record_key like 'personalized_habits_%'
       or record_key like 'wellbeing_%'
       or record_key like 'habit_%'
       or record_key like 'kaely_%'
       or record_key like 'local_notification_%'
     )
   );
```

Esta operação não deve remover progresso acadêmico, batalhas, revisões, XP, entitlements ou dados editoriais.

## Lembretes

O lembrete interno é calculado no próprio aparelho. A notificação do dispositivo usa `ServiceWorkerRegistration.showNotification()` somente após gesto explícito do aluno. Não existe assinatura Push, endpoint remoto ou envio de horários para servidor. Navegadores podem suspender tarefas quando o app está fechado; no iPhone, notificações web exigem o app instalado na Tela de Início.
