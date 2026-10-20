"""Instala el skill animate-illustrations-with-lottie en los agentes de esta máquina y revisa sus dependencias.

Uso: python3 instalar.py                 instala en los agentes que encuentre (enlace; en Windows, copia)
     python3 instalar.py --revisar       solo dice qué agentes hay y qué dependencias faltan
     python3 instalar.py --solo claude,codex   solo en esos agentes
     python3 instalar.py --todos         en todos los destinos conocidos, aunque el agente no esté instalado
     python3 instalar.py --solo agents   en la carpeta estándar ~/.agents/skills (para agentes que solo leen esa; Gemini la
                                         lee además de la suya, por eso no va por defecto)
     python3 instalar.py --copiar        copia la carpeta en vez de enlazarla (después hay que reinstalar para actualizar)
     python3 instalar.py --quitar        borra las instalaciones de este skill (solo enlaces o copias suyas)
                                         (si clonaste el repo justo en una carpeta de skills, esa carpeta no se toca ni se borra)
     python3 instalar.py --home DIR      usa DIR como carpeta personal en vez de la tuya (para probar sin tocar tus agentes)
Con enlace, un `git pull` en esta carpeta actualiza todos los agentes a la vez. Solo biblioteca estándar.
"""
import os, platform, re, shutil, subprocess, sys

NOMBRE = 'animate-illustrations-with-lottie'
RAIZ = os.path.dirname(os.path.realpath(__file__))   # realpath: si lo corres por un enlace ya instalado, no apuntes el enlace a sí mismo
H = os.path.expanduser('~')
# agente: (carpeta que indica que el agente está instalado, carpeta de skills global)
DESTINOS = {
    'claude': ('.claude', '.claude/skills'),
    'codex': ('.codex', '.codex/skills'),
    'opencode': ('.config/opencode', '.config/opencode/skills'),
    'kimi': ('.kimi', '.kimi/skills'),
    'gemini': ('.gemini', '.gemini/skills'),
    'antigravity': ('.gemini', '.gemini/config/skills'),
    'agents': ('.agents', '.agents/skills'),   # carpeta estándar de Agent Skills que leen otros agentes
}
# Solo con --solo agents o --todos: Gemini (y otros) también leen ~/.agents/skills y verían el skill dos veces.
SOLO_A_PEDIDO = {'agents'}
WINDOWS = platform.system() == 'Windows'
CHROMES = ('google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge')


def es_nuestro(ruta):
    """True si la ruta es un enlace a este skill o una copia suya (tiene SKILL.md con name: animate-illustrations-with-lottie)."""
    if os.path.islink(ruta):
        return os.path.realpath(ruta) == os.path.realpath(RAIZ)
    skill = os.path.join(ruta, 'SKILL.md')
    return os.path.isfile(skill) and f'name: {NOMBRE}' in open(skill, encoding='utf-8', errors='replace').read(400)


def es_esta_carpeta(ruta):
    """True si `ruta` es una carpeta real que es este mismo skill o lo contiene (el repo está clonado justo en un destino).
    Borrarla se llevaría el repo con su .git; un enlace sí se puede quitar sin riesgo."""
    if os.path.islink(ruta):
        return False
    real, raiz = os.path.realpath(ruta), os.path.realpath(RAIZ)
    return raiz == real or raiz.startswith(real + os.sep)


def version_node():
    """Versión mayor de node, o None si no está."""
    node = shutil.which('node')
    if not node:
        return None
    try:
        out = subprocess.run([node, '--version'], capture_output=True, text=True, timeout=10).stdout
        return int(re.match(r'v(\d+)', out.strip()).group(1))
    except Exception:
        return None


def hay_lottie_web():
    """lottie_light.min.js: $LOTTIE_LIGHT o node_modules de la carpeta actual o de sus padres."""
    if os.environ.get('LOTTIE_LIGHT'):
        return os.path.isfile(os.environ['LOTTIE_LIGHT'])
    d = os.getcwd()
    while True:
        if os.path.isfile(os.path.join(d, 'node_modules/lottie-web/build/player/lottie_light.min.js')):
            return True
        if os.path.dirname(d) == d:
            return False
        d = os.path.dirname(d)


def revisar():
    major = version_node()
    print(f'node       ' + ('ok (v%d)' % major if major and major >= 20 else
                            'FALTA (obligatorio, para los scripts): se necesita Node 20 o más nuevo' + (f' (hay v{major})' if major else '')))
    chrome = os.environ.get('CHROME') or next((c for c in CHROMES if shutil.which(c)), None)
    print('chrome     ' + (f'ok ({chrome})' if chrome else 'falta (opcional, para render.mjs y index-svg.mjs --png): Chrome o Chromium, o la variable CHROME'))
    print('lottie-web ' + ('ok' if hay_lottie_web() else 'falta (opcional, para render.mjs y la galería sin red): npm i lottie-web@5.13.0 en el proyecto, o la variable LOTTIE_LIGHT'))
    print('Agentes encontrados: ' + (', '.join(a for a, (base, _) in DESTINOS.items() if os.path.isdir(os.path.join(H, base))) or 'ninguno'))
    return bool(major and major >= 20)


def instalar(agentes, copiar):
    for a in agentes:
        dst = os.path.join(H, DESTINOS[a][1], NOMBRE)
        if os.path.lexists(dst):
            if es_esta_carpeta(dst):
                print(f'  {a:11} YA ESTÁ INSTALADO AQUÍ: {dst} es esta carpeta (no se toca)')
                continue
            if not es_nuestro(dst):
                print(f'  {a:11} SALTADO: {dst} ya existe y no es este skill')
                continue
            if os.path.islink(dst) or os.path.isfile(dst):
                os.remove(dst)
            else:
                shutil.rmtree(dst)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if copiar:
            shutil.copytree(RAIZ, dst, ignore=shutil.ignore_patterns('.git', '__pycache__', '*.pyc', 'node_modules'))
        else:
            os.symlink(RAIZ, dst, target_is_directory=True)
        print(f'  {a:11} {"copiado" if copiar else "enlazado"} en {dst}')


def quitar(agentes):
    for a in agentes:
        dst = os.path.join(H, DESTINOS[a][1], NOMBRE)
        if os.path.lexists(dst) and es_esta_carpeta(dst):
            print(f'  {a:11} NO SE QUITA: {dst} es esta carpeta (bórrala tú si quieres)')
        elif os.path.lexists(dst) and es_nuestro(dst):
            (os.remove if os.path.islink(dst) else shutil.rmtree)(dst)
            print(f'  {a:11} quitado de {dst}')


def main():
    global H
    args = sys.argv[1:]
    if '-h' in args or '--help' in args:
        print(__doc__)
        return 0
    if '--home' in args:
        i = args.index('--home')
        if i + 1 >= len(args):
            print('--home necesita una carpeta')
            return 2
        H = os.path.abspath(args[i + 1])
    node_ok = revisar()
    if '--revisar' in args:
        return 0 if node_ok else 1
    if '--solo' in args:
        i = args.index('--solo')
        if i + 1 >= len(args):
            print('--solo necesita agentes separados por coma, por ejemplo: --solo claude,codex')
            return 2
        agentes = [x.strip() for x in args[i + 1].split(',') if x.strip()]
        malos = [x for x in agentes if x not in DESTINOS]
        if malos:
            print(f'agentes desconocidos: {malos}; conocidos: {", ".join(DESTINOS)}')
            return 2
    elif '--todos' in args:
        agentes = list(DESTINOS)
    else:
        agentes = [a for a, (base, _) in DESTINOS.items() if os.path.isdir(os.path.join(H, base)) and a not in SOLO_A_PEDIDO]
        if '--quitar' in args:   # al quitar, también la carpeta estándar si quedó de antes
            agentes += sorted(SOLO_A_PEDIDO)
    if '--quitar' in args:
        quitar(agentes)
        return 0
    if not agentes:
        print('No encontré agentes instalados. Usa --solo <agente> o --todos.')
        return 1
    instalar(agentes, copiar='--copiar' in args or WINDOWS)
    return 0


if __name__ == '__main__':
    sys.exit(main())
