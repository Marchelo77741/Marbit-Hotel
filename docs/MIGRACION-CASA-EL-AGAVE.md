# Pasar Casa El Agave a Marbit-Hotel (etapa 6)

Es el único paso que mueve datos reales. Se hace con respaldo y se puede repetir sin duplicar nada.

## Antes
1. En el programa anterior: Ajustes → **Descargar respaldo (.json)**. Guarda ese archivo en un lugar seguro; es tu salvavidas.
2. Opcional: en el servidor, descarga también el respaldo de rockolam (carpeta de respaldos).

## Pasar los datos
1. Abre Marbit-Hotel, crea tu cuenta y tu posada (nombre corto sugerido: `casa-el-agave`).
2. Ajustes → **Respaldo de datos** → «Pasar datos del programa anterior»:
   - Marca «Pasar también tarifas, ajustes y contenido de la página».
   - Deja el servidor anterior (`https://respaldos.2xou.com`) para que se bajen las fotos.
   - Elige el respaldo y confirma. Avisará si hay reservaciones que se traslapan o que usan habitaciones inexistentes.
3. Espera a que el indicador de arriba diga «Al día» y pulsa **Verificar contra la nube**: todas las filas deben mostrar ✓.
4. Si alguna reservación quedó «sin guardar» (conflicto), ábrela desde el indicador y cambia su habitación o fechas.

## Dominio
Corre `supabase/admin/alta_dominio.sql` (Marbit) para enlazar `casaelagave.com` a la posada. La página actual ya busca sus datos en Marbit-Hotel por dominio; mientras no estén, usa el servidor anterior.

## Retirar rockolam (solo cuando todo esté verificado)
- Casa El Agave opera una semana completa con Marbit-Hotel sin pendientes ni conflictos.
- Hay un respaldo reciente del servidor anterior guardado aparte.
- Entonces: quitar la dirección del servidor en cada dispositivo y apagar `servidor-respaldos` (pm2 stop).
