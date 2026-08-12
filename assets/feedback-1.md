# Extracción Exhaustiva de Requerimientos — MyNet

**Fuente:** Transcript “Refinamiento de Requerimientos” — 12 de agosto de 2026  
**Duración:** 52 minutos  
**Participantes:** Danny Pérez, Pao Rodríguez Marín (“SoyPao”)

> Nota de interpretación: el transcript transcribe el nombre del producto de distintas formas (“mainete”, “mainer”, “marinette”, etc.). En este documento se normaliza únicamente el **nombre del producto** como **MyNet**.  
> No se consolidan requerimientos similares ni se eliminan aparentes redundancias. Cada mención funcional o de negocio se conserva como unidad independiente cuando podría representar una intención distinta del cliente.

---

## 1. Piloto, validación y adopción inicial

### REQ-001 — Validación de la plataforma en un entorno real controlado
La plataforma debe probarse con usuarios reales en campo para obtener retroalimentación sobre su uso.

**Contexto:** Danny indica que la plataforma ya es usable, pero requiere feedback de personas utilizándola en una situación real.  
**Referencia:** 07:25–07:48.

### REQ-002 — Primera prueba con un grupo reducido
La primera validación debe realizarse con una cantidad reducida de personas, aproximadamente entre **5 y 10 usuarios**.

**Referencia:** 06:21–06:39.

### REQ-003 — Selección controlada de participantes del piloto
Programa Semilla debe seleccionar quiénes serán los candidatos para participar en la prueba inicial.

**Referencia:** 06:21–06:39.

### REQ-004 — Posibilidad de usar personal interno y mentores para la simulación
La validación inicial puede realizarse mediante una simulación con el equipo de Programa Semilla, incluyendo mentores.

**Referencia:** 07:05–07:21.

### REQ-005 — Inducción previa de los usuarios piloto
Los usuarios seleccionados para el piloto deben recibir una inducción de la plataforma antes de utilizarla.

**Referencia:** 06:39–07:05.

### REQ-006 — Equipo de Programa Semilla debe dominar la aplicación antes del evento
Las personas de Programa Semilla que apoyen la prueba deben conocer suficientemente la aplicación para poder asistir a terceros durante el evento.

**Referencia:** 46:01–47:31.

### REQ-007 — Manuales de usuario
Se deben generar manuales de usuario para compartirlos con el grupo que participará en la prueba.

**Referencia:** 46:01–47:00.

### REQ-008 — Usuarios de apoyo deben conocer la instalación en iPhone y Android
El personal que apoye el evento debe entender cómo instalar o acceder a la aplicación tanto desde iPhone como desde Android, para poder orientar a los asistentes.

**Referencia:** 47:00–47:31.

### REQ-009 — Mecanismo para recopilar feedback del piloto
Debe definirse una forma de recopilar la retroalimentación de los usuarios durante o después de la prueba de campo.

**Estado:** abierto; se discute que un simple botón de feedback podría no ser suficiente.  
**Referencia:** 47:31–48:09.

---

## 2. Modelo general de eventos

### REQ-010 — MyNet debe soportar múltiples tipos de evento
La plataforma debe poder utilizarse en distintos formatos de actividades, incluyendo, entre otros:

- seminarios;
- hackatones;
- desayunos de networking;
- eventos empresariales;
- congresos de varios días;
- talleres de pocas horas;
- eventos virtuales;
- eventos presenciales.

**Referencia:** 04:52–05:28 y 07:49–08:26.

### REQ-011 — Un evento puede tener una agenda con uno o múltiples elementos
Un taller sencillo podría tener un único ítem de agenda, mientras que congresos u otros eventos pueden tener múltiples sesiones.

**Referencia:** 07:49–08:26.

### REQ-012 — Cada elemento de agenda debe tener información base
Cada sesión o elemento de agenda debe poder registrar, al menos:

- persona que imparte la charla o taller;
- tema;
- descripción corta.

**Referencia:** 08:26–08:49.

### REQ-013 — Sesiones virtuales deben permitir incluir enlace de acceso
Para actividades virtuales, debe existir una forma de agregar el enlace de acceso a la sesión. En la conversación se propone colocarlo en el campo de descripción.

**Referencia:** 08:26–08:49.

### REQ-014 — Presentadores forman parte del modelo del evento
Las conferencias/eventos pueden tener presentadores asociados.

**Referencia:** 03:45–04:52.

### REQ-015 — Participantes atienden eventos como personas individuales
La unidad de inscripción y participación es la **persona**, no la empresa.

**Referencia:** 08:51–10:48.

### REQ-016 — Una empresa puede enviar varias personas, cada una con usuario propio
Si una empresa envía varias personas a un evento, cada participante debe inscribirse y utilizar su propia cuenta.

**Referencia:** 08:51–10:48.

---

## 3. Invitación, inscripción y control de acceso

### REQ-017 — Invitación por correo electrónico
La invitación al evento debe poder enviarse por correo electrónico.

**Referencia:** 11:53–13:06.

### REQ-018 — Invitación debe contener un enlace a la plataforma
El correo de invitación debe contener un enlace que permita iniciar el proceso de acceso o registro.

**Referencia:** 11:53–13:06.

### REQ-019 — Usuario existente debe poder agregar el evento a su cuenta
Si la persona invitada ya tiene una cuenta de MyNet, al utilizar la invitación el evento debe quedar asociado a su cuenta y disponible dentro de su experiencia.

**Referencia:** 11:53–12:31.

### REQ-020 — Usuario nuevo debe crear cuenta antes de ingresar al evento
Si la persona no tiene una cuenta, la plataforma debe solicitarle crearla y posteriormente asociarla al evento.

**Referencia:** 11:53–12:31.

### REQ-021 — Código de invitación único por persona y por evento
La invitación debe utilizar un código único vinculado a una persona específica y a un evento específico.

**Referencia:** 12:42–13:39.

### REQ-022 — Controlar acceso de personas no invitadas
Una persona que no haya sido invitada al evento no debe poder acceder al evento.

**Referencia:** 12:50–13:39.

### REQ-023 — Controlar acceso de personas no inscritas
Una persona que no se haya inscrito no debe poder acceder a las funcionalidades privadas del evento.

**Referencia:** 12:50–13:39.

### REQ-024 — Controlar acceso cuando el evento requiere pago
Cuando aplique, una persona que no haya pagado el seminario/evento no debe poder acceder al evento.

**Referencia:** 12:50–13:39.

### REQ-025 — Crear cuenta de MyNet no implica acceso automático a cualquier evento
Una persona puede crear una cuenta general en MyNet, pero esto no debe darle acceso automáticamente a eventos para los cuales no tiene autorización.

**Referencia:** 12:50–13:39.

### REQ-026 — Personas sin acceso no deben poder enviar preguntas al evento
Quien no tenga acceso válido al evento no debe poder utilizar la funcionalidad de preguntas del evento.

**Referencia:** 12:50–13:39.

---

## 4. Perfil personal

### REQ-027 — Perfil inicial al crear cuenta
La primera vez que una persona crea una cuenta debe completar un perfil.

**Referencia:** 13:42–17:15.

### REQ-028 — Perfil debe incluir sector
El perfil debe solicitar el sector en el que trabaja la persona.

**Referencia:** 13:42–17:15.

### REQ-029 — Perfil debe incluir subsector
El perfil debe solicitar el subsector correspondiente.

**Referencia:** 15:49–17:15.

### REQ-030 — Perfil debe incluir descripción corta de la actividad productiva
La persona debe poder escribir una descripción manual y breve de su actividad productiva.

**Ejemplos mencionados:** pan libre de gluten, pan de masa madre, bisutería.  
**Referencia:** 17:15–18:29.

### REQ-031 — Perfil debe incluir intereses de networking
El perfil debe permitir indicar qué busca la persona al hacer networking.

**Ejemplos mencionados:** alianzas, distribución, servicios profesionales.  
**Referencia:** 17:15–18:29.

### REQ-032 — Intereses deben seleccionarse desde opciones predefinidas
Los intereses no deberían depender únicamente de texto libre; el cliente plantea que el usuario los marque a partir de opciones.

**Referencia:** 13:42–14:16.

### REQ-033 — Existe una lista de intereses que el cliente puede proporcionar
La plataforma deberá utilizar una lista de intereses que Pao indica que puede compartir.

**Referencia:** 17:15–18:29.

### REQ-034 — Sector debe seleccionarse desde categorías preestablecidas
Los sectores deben provenir de una lista controlada, no de texto libre.

**Referencia:** 14:29–17:15.

### REQ-035 — Sectores globales mencionados
La taxonomía base planteada contiene las categorías globales:

- Servicios
- Comercio
- Industria
- Agro

**Referencia:** 14:43–15:39.

### REQ-036 — Sectores deben tener subcategorías
Cada sector debe disponer de una lista depurada de subcategorías/subsectores.

**Referencia:** 15:49–17:15.

### REQ-037 — No utilizar la taxonomía completa de instituciones externas
Aunque existen taxonomías mucho más extensas (por ejemplo, Ministerio de Economía o Banca para el Desarrollo), el cliente quiere una lista depurada y manejable.

**Referencia:** 15:49–17:15.

---

## 5. Empresa representada por el usuario

### REQ-038 — Nombre de empresa debe ser opcional
El usuario puede indicar el nombre de la empresa en la que trabaja, pero este dato es opcional.

**Referencia:** 27:22–28:08.

### REQ-039 — Perfil profesional puede existir sin empresa
Una persona debe poder participar en MyNet sin tener que registrar una empresa.

**Referencia:** 27:22–28:08.

### REQ-040 — Si se indica empresa, el nombre puede aparecer en la tarjeta de match
Cuando el usuario haya proporcionado un nombre de empresa, este debe poder mostrarse en la tarjeta de networking/match.

**Referencia:** 27:42–28:08.

### REQ-041 — Si no se indica empresa, la tarjeta no debe mostrar empresa
Si el campo de empresa está vacío, la tarjeta de networking no debe mostrar ese dato.

**Referencia:** 27:42–28:08.

### REQ-042 — Sector, subsector y actividad productiva complementan la información empresarial/profesional
Además del nombre opcional de empresa, el perfil utiliza sector, subsector y descripción de actividad productiva para describir el contexto profesional de la persona.

**Referencia:** 27:22–28:08.

---

## 6. Networking, match y privacidad de contacto

### REQ-043 — Cada persona realiza networking según sus propios intereses
Los intereses y las conexiones deben manejarse de forma individual, no como grupo o empresa.

**Referencia:** 08:51–10:48.

### REQ-044 — Datos de contacto no deben ser visibles por defecto
Los datos de contacto de una persona no deben exponerse automáticamente.

**Referencia:** 28:08–28:18.

### REQ-045 — Usuario debe poder decidir compartir sus datos de contacto
La visibilidad de los datos de contacto debe depender de una acción/decisión del usuario.

**Referencia:** 28:08–28:18.

### REQ-046 — Tarjeta de networking debe utilizar solo la información que el usuario haya decidido hacer pública
La información visible en networking debe limitarse a los datos definidos como públicos por la persona.

**Referencia:** 51:47–52:31.

### REQ-047 — Networking debe poder existir fuera de un evento
La funcionalidad de networking debe permanecer activa independientemente de si el usuario está participando actualmente en un evento.

**Referencia:** 51:47–52:31.

### REQ-048 — El usuario debe poder descubrir personas de la comunidad general de MyNet
Fuera de un evento, el perfil debe poder mostrar personas que se han unido a la plataforma y que tienen información pública disponible.

**Referencia:** 52:10–52:31.

### REQ-049 — Networking abierto fuera de eventos requiere revisión legal
Antes de dejar esta experiencia abierta fuera de eventos, debe revisarse su viabilidad legal y los riesgos asociados.

**Estado:** pendiente de consulta con abogados.  
**Referencia:** 52:10–52:31.

---

## 7. Preguntas durante una charla o taller

### REQ-050 — Participantes deben poder enviar preguntas desde la plataforma
Durante sesiones virtuales o presenciales, un participante autorizado debe poder realizar consultas mediante MyNet.

**Referencia:** 08:51–11:37 y 17:15–20:00.

### REQ-051 — La plataforma debe admitir un volumen de preguntas mayor que el que puede contestarse en vivo
El sistema debe poder recibir preguntas de muchos asistentes aunque por tiempo no todas puedan ser respondidas durante la sesión.

**Referencia:** 09:00–11:37.

### REQ-052 — Preguntas repetidas deben poder agruparse
Cuando varias preguntas son equivalentes o muy similares, debe existir la posibilidad de agruparlas para evitar hacer la misma pregunta repetidamente.

**Referencia:** 10:48–11:37.

### REQ-053 — Agrupación automática de preguntas similares es deseable
Se plantea que el sistema pueda detectar que muchas preguntas son equivalentes y agruparlas automáticamente.

**Estado:** deseable / no obligatoria para primera versión.  
**Referencia:** 10:48–11:37 y 18:29–19:04.

### REQ-054 — Moderador debe poder agrupar manualmente preguntas similares
Si la plataforma no realiza agrupación automática, la persona moderadora debe tener una forma de consolidarlas manualmente.

**Referencia:** 18:29–19:04.

### REQ-055 — Pregunta debe poder marcarse como resuelta
El moderador debe poder indicar que una pregunta ya fue respondida.

**Referencia:** 18:29–20:00.

### REQ-056 — Pregunta debe poder marcarse como pendiente
El moderador debe poder indicar que una pregunta quedó sin respuesta.

**Referencia:** 18:29–20:00.

### REQ-057 — Preguntas pendientes deben mantenerse para seguimiento posterior
Las preguntas que no se respondan durante el evento deben conservarse para ser respondidas posteriormente.

**Referencia:** 19:04–20:00.

### REQ-058 — Preguntas enviadas no se responden necesariamente en tiempo real dentro de la app
No se espera que alguien transcriba en tiempo real dentro de la aplicación la respuesta oral del expositor.

**Referencia:** 25:11–27:13.

### REQ-059 — Después del evento, preguntas deben poder enviarse al expositor para obtener respuestas
Las preguntas recopiladas pueden ser remitidas al facilitador/expositor para que proporcione respuestas escritas posteriormente.

**Referencia:** 25:56–27:13.

### REQ-060 — Respuesta posterior puede ser corta
El modelo planteado es que el expositor pueda responder cada pregunta con aproximadamente dos o tres líneas.

**Referencia:** 26:30–27:13.

---

## 8. Identidad de la persona que pregunta

### REQ-061 — La plataforma debe conocer internamente quién hizo cada pregunta
Aunque la identidad mostrada al resto de participantes sea limitada, el sistema/organización debe poder identificar al autor real de una pregunta.

**Referencia:** 29:18–30:32.

### REQ-062 — Mostrar solo el primer nombre del autor
Como decisión conversada, las preguntas visibles para otros participantes pueden mostrar únicamente el primer nombre, sin apellidos.

**Referencia:** 29:22–30:29.

### REQ-063 — Evitar exponer nombre completo en preguntas
El nombre completo no debería mostrarse como parte de la visualización pública de una pregunta.

**Referencia:** 29:22–30:29.

### REQ-064 — Anonimato total fue considerado pero no quedó como decisión final
Se discutió que una persona que no quisiera compartir su tarjeta pudiera hacer preguntas anónimas, pero luego se propuso mostrar el primer nombre.

**Estado:** conversación parcialmente resuelta; conservar como decisión a confirmar si la privacidad de tarjeta y la identidad en preguntas quedan desacopladas.  
**Referencia:** 28:18–30:29.

---

## 9. Moderación de preguntas

### REQ-065 — Evento puede tener más de un coordinador/moderador
La operación del evento debe soportar que existan varias personas coordinadoras.

**Referencia:** 31:16–31:43.

### REQ-066 — Debe existir una vista privada de preguntas para moderación
Antes de ser visibles para los asistentes, las preguntas deben poder pasar por una pantalla que solo vean moderadores/coordinadores.

**Referencia:** 31:16–32:14.

### REQ-067 — Moderador debe aceptar/aprobar preguntas
El moderador debe poder indicar qué preguntas pasan a la vista pública.

**Referencia:** 31:43–32:14.

### REQ-068 — Preguntas no aprobadas no deben ser visibles al público
Una pregunta solo debe aparecer a los asistentes después de haber sido aceptada por moderación.

**Referencia:** 31:43–32:14.

### REQ-069 — Moderador debe poder bloquear o eliminar preguntas
La persona moderadora debe poder descartar preguntas inapropiadas, ofensivas, bromas u otro contenido que no deba mostrarse.

**Referencia:** 30:32–31:16.

### REQ-070 — Debe existir un estado/acción equivalente a “pregunta eliminada” o “pregunta bloqueada”
La interfaz de moderación debe contemplar una acción explícita para impedir que una pregunta avance.

**Referencia:** 30:32–31:16.

---

## 10. Votación y priorización de preguntas

### REQ-071 — Participantes pueden ver preguntas previamente aprobadas
Los usuarios con la aplicación abierta deben poder ver las preguntas que ya fueron moderadas y aceptadas.

**Referencia:** 31:43–32:14.

### REQ-072 — Participantes deben poder votar por preguntas
Una vez visible, otros asistentes deben poder indicar que una pregunta también les interesa.

**Referencia:** 31:43–32:14.

### REQ-073 — Votos deben influir en el orden/prioridad
Las preguntas con mayor apoyo deben subir en el orden de presentación/prioridad.

**Referencia:** 31:43–32:14.

### REQ-074 — Moderación debe ocurrir antes de la votación pública
La secuencia funcional indicada es: recibir pregunta → moderar/aceptar → hacer pública → permitir votos.

**Referencia:** 31:16–32:14.

---

## 11. Vista proyectable de preguntas

### REQ-075 — Debe existir una pantalla de preguntas que pueda proyectarse
Se propone crear una vista específica para mostrar en una pantalla/proyector las preguntas ya moderadas.

**Referencia:** 32:14–32:35.

### REQ-076 — Vista proyectable debe mostrar puntaje/votos
La pantalla proyectable debe incluir el puntaje o cantidad de votos de cada pregunta.

**Referencia:** 32:14–32:35.

### REQ-077 — Vista proyectable debe reflejar cambios de prioridad
Las preguntas deben poder verse cambiando de posición conforme aumenta su votación.

**Referencia:** 32:14–32:35.

---

## 12. Sesiones opcionales, matrícula y capacidad

### REQ-078 — Un evento puede tener actividades obligatorias y opcionales
Dentro de una misma agenda pueden existir charlas fijas y otras sesiones que el participante elige.

**Referencia:** 22:37–24:02.

### REQ-079 — Participante debe poder seleccionar a cuál sesión opcional asistir
Cuando hay sesiones simultáneas u opcionales, el usuario debe poder matricularse/confirmar asistencia en una de ellas.

**Referencia:** 22:37–24:02.

### REQ-080 — Sesión opcional puede tener cupo máximo
Cada actividad opcional debe poder configurarse con una cantidad máxima de participantes.

**Referencia:** 22:37–24:02.

### REQ-081 — Matrícula debe cerrarse al alcanzar el cupo
Cuando una sesión llegue a su capacidad máxima, el sistema debe impedir nuevas inscripciones.

**Referencia:** 22:37–24:02.

### REQ-082 — Confirmación de asistencia mediante acción explícita
Se propone un botón o acción equivalente a “confirmar asistencia” para sesiones opcionales.

**Referencia:** 23:35–24:02.

### REQ-083 — Matrícula puede permanecer disponible hasta cerca del inicio si existe cupo
La inscripción a una actividad podría seguir disponible incluso pocos minutos antes, siempre que la configuración lo permita y haya cupo.

**Referencia:** 24:02–24:20.

### REQ-084 — Cada sesión opcional debe poder configurar una fecha/hora límite de reserva
Debe existir un parámetro que indique hasta cuándo una persona puede matricularse.

**Referencia:** 24:20–25:11.

### REQ-085 — El cierre de matrícula debe ser configurable por actividad
La anticipación de cierre podría variar —por ejemplo, 2 horas, 3 horas, 5 horas o 24 horas— según las necesidades de la sesión.

**Referencia:** 24:20–25:11.

### REQ-086 — Algunas actividades requieren cierre anticipado por materiales
El modelo de configuración debe contemplar que determinadas sesiones necesiten cerrar matrícula con mayor anticipación porque requieren preparar materiales.

**Referencia:** 24:20–25:11.

---

## 13. Cierre del evento e historial

### REQ-087 — Al finalizar un evento, la agenda no debe permanecer disponible
La cliente considera que después del cierre ya no es necesario que los asistentes sigan viendo la agenda.

**Referencia:** 21:01–22:37.

### REQ-088 — Al finalizar un evento, información operacional del evento puede dejar de estar disponible
Además de la agenda, la cliente menciona que información como quién fue el expositor no necesariamente debe permanecer accesible dentro de la experiencia post-evento.

**Referencia:** 21:57–22:37.

### REQ-089 — Debe existir contenido post-evento relacionado con preguntas pendientes
Aunque otros datos del evento dejen de estar disponibles, el seguimiento de preguntas pendientes sí debe mantenerse.

**Referencia:** 21:57–22:37.

### REQ-090 — Historial general del evento quedó como pregunta de diseño
Danny plantea si el evento debería desaparecer completamente de la app o mantenerse en un historial, pero no queda una definición cerrada.

**Estado:** abierto.  
**Referencia:** 21:01–21:57.

---

## 14. Resumen y material post-evento

### REQ-091 — Posibilidad futura de publicar resumen del evento
Se desea, en una fase futura, poder compartir un resumen breve de la charla/taller después del evento.

**Referencia:** 20:00–21:01.

### REQ-092 — Posibilidad futura de publicar preguntas y respuestas del evento
Se desea poder distribuir una recopilación de preguntas y respuestas generadas durante la actividad.

**Referencia:** 20:00–21:01.

### REQ-093 — Preguntas pendientes sí deben poder ser respondidas después del evento
Independientemente de si se implementa el resumen completo, las preguntas pendientes deben contar con una forma de recibir respuesta posterior.

**Referencia:** 20:00–21:01.

### REQ-094 — Organizador debe poder cargar un documento de preguntas y respuestas
Después de recibir respuestas del expositor, el organizador debe poder cargar un documento asociado a la charla/evento.

**Referencia:** 26:30–27:13.

### REQ-095 — Usuario debe recibir notificación cuando se publique el documento
Cuando el documento de preguntas y respuestas esté disponible, los participantes deben recibir una notificación.

**Referencia:** 26:30–27:13.

### REQ-096 — Notificación debe identificar la charla/documento disponible
La notificación debe permitir entender a qué charla corresponde el material publicado.

**Referencia:** 26:30–27:13.

### REQ-097 — Usuario debe poder decidir si descarga el documento
La disponibilidad del archivo no debe implicar descarga automática; el usuario decide si lo descarga.

**Referencia:** 26:30–27:13.

---

## 15. QR asociado al perfil personal

### REQ-098 — Usuario debe poder generar/descargar un QR de su perfil
Desde su perfil, una persona debe poder obtener un QR que pueda compartir.

**Referencia:** 35:30–37:13.

### REQ-099 — QR de perfil debe abrir la tarjeta de MyNet del usuario
Al escanear el QR, la otra persona debe llegar directamente a la tarjeta/perfil de networking correspondiente.

**Referencia:** 35:30–37:13.

### REQ-100 — QR puede facilitar acceso a información de contacto compartida
La tarjeta abierta desde el QR debe exponer los datos que el usuario haya autorizado compartir.

**Referencia:** 35:30–37:13.

### REQ-101 — Desde la tarjeta podría existir una acción para guardar/descargar contacto
Se menciona como posibilidad una acción equivalente a “descargar contactos”.

**Estado:** propuesta.  
**Referencia:** 36:23–37:13.

### REQ-102 — QR de perfil puede imprimirse en gafetes
Para eventos como Invicta, el QR personal puede incluirse en los gafetes impresos de los asistentes.

**Referencia:** 38:28–39:17.

### REQ-103 — Escanear el gafete debe llevar a la tarjeta del participante
Cuando el QR esté impreso en el gafete, escanearlo debe abrir el perfil/tarjeta correspondiente dentro de MyNet.

**Referencia:** 38:34–39:17.

### REQ-104 — QR también puede incorporarse en una invitación
Se considera útil agregar un QR a la invitación, especialmente cuando esta se abre desde una computadora y el usuario puede escanearla con el celular.

**Referencia:** 37:13–38:28.

---

## 16. QR externo de empresa/productos

### REQ-105 — Puede existir un segundo QR no administrado por MyNet
El cliente plantea un segundo QR que lleve a material externo como catálogo, web u otra información empresarial.

**Referencia:** 35:57–37:13.

### REQ-106 — Segundo QR puede apuntar a catálogo o material descriptivo
Ese QR externo podría abrir un PDF, catálogo de productos, página web u otro recurso definido por la empresa/persona.

**Referencia:** 35:57–37:13.

### REQ-107 — Segundo QR no necesariamente forma parte de la lógica interna de la aplicación
Durante la conversación se aclara que este QR puede ser un QR convencional y no necesariamente una funcionalidad que deba administrar MyNet.

**Referencia:** 36:23–37:13.

---

## 17. Uso en computadora y móvil / PWA

### REQ-108 — La plataforma debe poder utilizarse desde computadora
Los asistentes deben poder abrir y utilizar la aplicación desde una computadora.

**Referencia:** 48:01–49:02.

### REQ-109 — La plataforma debe poder utilizarse desde celular
Los asistentes deben poder utilizar la aplicación desde su teléfono durante el evento.

**Referencia:** 48:01–49:02.

### REQ-110 — La misma solución debe cubrir ambos contextos
Se espera que la naturaleza PWA de la aplicación permita cubrir computadora y móvil con la misma solución.

**Referencia:** 48:01–49:02.

### REQ-111 — Experiencia móvil es importante cuando el usuario se desplaza
La versión móvil debe permitir que la persona continúe interactuando con la aplicación cuando se aleja de su computadora, por ejemplo durante comidas o desplazamientos dentro del evento.

**Referencia:** 48:09–49:02.

### REQ-112 — Notificaciones deben apoyar actividades próximas
Se menciona como caso de uso que la aplicación pueda notificar al usuario que una charla comenzará próximamente, por ejemplo en 15 minutos.

**Referencia:** 48:09–49:02.

---

## 18. Administración de eventos

### REQ-113 — Debe existir posteriormente una interfaz administrativa para crear eventos
La versión actual utiliza datos “quemados”; se reconoce que será necesaria una parte administrativa desde la cual se puedan crear y configurar eventos.

**Referencia:** 45:22–46:01.

### REQ-114 — Interfaz administrativa debe permitir ingresar datos del evento
La administración deberá permitir cargar la información que actualmente se encuentra fija en la aplicación.

**Referencia:** 45:22–46:01.

### REQ-115 — Administración fue intencionalmente pospuesta frente a la validación del producto
La prioridad actual es poner la aplicación a funcionar y obtener feedback antes de desarrollar completamente la burocracia administrativa.

**Referencia:** 45:22–46:01.

---

## 19. Diferenciación funcional / alcance del producto

### REQ-116 — El foco distintivo de MyNet es networking controlado
La propuesta del producto se diferencia de plataformas genéricas de eventos por el networking entre personas bajo reglas de acceso y privacidad controladas.

**Referencia:** 49:33–52:10.

### REQ-117 — Streaming no forma parte del alcance actual
Se menciona explícitamente que MyNet actualmente no tiene capacidad de streaming y que esa es una diferencia frente a otras plataformas.

**Referencia:** 50:21–51:37.

### REQ-118 — MyNet no debe limitarse a ser un host de eventos
El valor que se quiere mantener vivo es la red de personas y sus tarjetas de networking, no solamente la agenda o la ejecución puntual del evento.

**Referencia:** 49:54–52:10.

---

# Decisiones o temas todavía abiertos

Estos puntos aparecen en la conversación pero **no quedan completamente cerrados**. No se deben convertir en requerimientos definitivos sin confirmación.

## OPEN-001 — ¿Existe historial de eventos finalizados?
Se pregunta si un evento debe desaparecer completamente o quedar en un historial. Pao sí indica que la agenda ya no debería estar disponible, pero no define de manera concluyente si debe existir una entrada histórica del evento.

## OPEN-002 — Relación entre privacidad de la tarjeta y anonimato de preguntas
Inicialmente se discute que, si una persona no comparte su tarjeta, podría preguntar anónimamente. Luego se acuerda mostrar solo el primer nombre. Debe confirmarse si:
1. siempre se muestra el primer nombre; o
2. privacidad de tarjeta permite anonimato adicional.

## OPEN-003 — Agrupación automática de preguntas
Es deseable que el sistema detecte preguntas equivalentes, pero la cliente acepta que inicialmente esa consolidación la pueda realizar manualmente la persona moderadora.

## OPEN-004 — Formato exacto del contenido post-evento
Se mencionan varias posibilidades:
- resumen;
- preguntas y respuestas;
- archivo descargable;
- notificación;
- respuestas solo de las preguntas pendientes.

No queda definido un único formato obligatorio para todo el contenido post-evento.

## OPEN-005 — Mecanismo de captura de feedback del piloto
Se reconoce la necesidad de recopilar feedback, pero no se define si será mediante:
- funcionalidad dentro de MyNet;
- formulario externo;
- entrevistas;
- acompañamiento presencial;
- otra alternativa.

## OPEN-006 — Networking abierto fuera de eventos
Funcionalmente se quiere mantener el networking activo de forma permanente, pero Pao indica que revisará con abogados la exposición legal y de seguridad de abrir la comunidad fuera de eventos.

## OPEN-007 — Acción “descargar contacto”
Se menciona durante la conversación como una posible acción al abrir una tarjeta por QR, pero no queda confirmada como flujo definitivo.

---

# Elementos explícitamente contextuales, no convertidos en requerimientos

Los siguientes temas aparecen en la conversación, pero no se interpretaron como requerimientos del producto:

- Desayunos empresariales del 26/27 de agosto como posibles espacios de validación.
- Evento Invicta previsto para mediados de noviembre si es adjudicado.
- Compra histórica de lectores biométricos y televisores para otros proyectos.
- Comentarios sobre el uso de QR solicitado por una contraparte externa.
- Conversación sobre Claude, organización de archivos y automatización personal.
- Solicitud puntual de revisar otro documento de Invicta.
- Discusión competitiva sobre Bumble y otras plataformas de eventos.

---

# Resumen cuantitativo de extracción

- **118 requerimientos / decisiones funcionales extraídos individualmente**
- **7 temas abiertos preservados sin resolver**
- **19 grandes áreas funcionales identificadas**
- **No se consolidaron aparentes duplicados**
- **No se eliminaron requerimientos por parecer similares**
- **Las ideas futuras u opcionales se conservaron y se marcaron como tales**
