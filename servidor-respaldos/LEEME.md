# Servicio de respaldos de reservaciones (servidor rockolam)

Recibe el respaldo que envía la app, lo guarda en el disco y conserva: el más reciente, 1 por hora
durante 48 horas, 1 por día durante 30 días y 1 por semana durante 13 semanas. No necesita `npm install`.

## 1. Copiar a la carpeta del servidor
Desde tu PC (PowerShell), en la carpeta del proyecto:

    scp -r servidor-respaldos usuario@192.168.1.130:~/respaldos-reservaciones

## 2. Arrancarlo con pm2 (por SSH en el servidor)

    cd ~/respaldos-reservaciones
    export BACKUP_KEY=$(openssl rand -hex 24)   # ANOTA esta clave: se pega en la app
    echo "$BACKUP_KEY"
    BACKUP_DIR=/RUTA/DEL/DISCO/respaldos-reservaciones pm2 start server.js --name respaldos-reservaciones --update-env
    pm2 save

Cambia `/RUTA/DEL/DISCO/...` por la carpeta del disco externo (si aún no lo montaste, puedes usar
`~/respaldos-reservaciones/respaldos` y cambiarlo después). Prueba local:

    curl http://127.0.0.1:3100/health

## 3. Publicarlo por el túnel de Cloudflare
En el archivo del túnel `rockola` (normalmente `/etc/cloudflared/config.yml` o `~/.cloudflared/config.yml`)
agrega, ANTES de la regla final `http_status:404`:

      - hostname: respaldos.2xou.com
        service: http://127.0.0.1:3100

Luego:

    cloudflared tunnel route dns rockola respaldos.2xou.com
    sudo systemctl restart cloudflared

IMPORTANTE: en Cloudflare Zero Trust NO pongas `respaldos.2xou.com` dentro de una aplicación de Access
(como la de nube.2xou.com): la app respalda sola y no puede escribir el código del correo. La protege la clave.

## 4. En la app
Ajustes → «Respaldo en el servidor»: dirección `https://respaldos.2xou.com`, pega la clave y pulsa «Probar y guardar».

## Mantenimiento
- Ver respaldos: `ls -lh /RUTA/DEL/DISCO/respaldos-reservaciones`
- Cambiar la clave: `pm2 delete respaldos-reservaciones`, vuelve a exportar `BACKUP_KEY` y a arrancar; pega la nueva en la app.
- Copia de este disco: son archivos .json normales; puedes incluirlos en tu copia general.

## Página web (casaelagave.com): fotos, contenido y solicitudes
La versión nueva del servidor también:
- guarda las **fotos** de las habitaciones y de la página (carpeta `datos/fotos`),
- publica **sin clave** (solo lectura) `/pub/habitaciones`, `/pub/sitio` y `/pub/foto/<id>.jpg`, que lee la página,
- recibe las **solicitudes de informes** de la página en `/pub/solicitud` (máx. 5 por hora por visitante, solo desde los
  sitios de `PUBLIC_ORIGINS`) y las guarda en `datos/solicitudes` hasta que la app las baja.

Todo lo demás (subir fotos, publicar habitaciones, bajar solicitudes) exige la clave, igual que los respaldos.
Nada de reservaciones ni de huéspedes se publica: solo lo que marcas en Ajustes → Habitaciones y Página web.

Al actualizar el servidor copia el nuevo `server.js` y reinicia: `pm2 restart respaldos-reservaciones --update-env`.
Variables nuevas (opcionales): `DATA_DIR` (carpeta de `datos`, por defecto junto a server.js; conviene ponerla en el mismo
disco que los respaldos) y `PUBLIC_ORIGINS` (por defecto `https://casaelagave.com,https://www.casaelagave.com`).
