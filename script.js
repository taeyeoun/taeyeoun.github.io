const nav = document.getElementById('mainNav');
const hero = document.getElementById('top');

function updateNavState() {
  const heroBottom = hero.offsetTop + hero.offsetHeight;
  const triggerPoint = window.scrollY + nav.offsetHeight;

  if (triggerPoint >= heroBottom) {
    nav.classList.add('nav-scrolled');
    nav.classList.remove('nav-hover');
  } else {
    nav.classList.remove('nav-scrolled');
  }
}

nav.addEventListener('mouseenter', () => {
  if (!nav.classList.contains('nav-scrolled')) {
    nav.classList.add('nav-hover');
  }
});

nav.addEventListener('mouseleave', () => {
  if (!nav.classList.contains('nav-scrolled')) {
    nav.classList.remove('nav-hover');
  }
});

window.addEventListener('scroll', updateNavState);
window.addEventListener('load', updateNavState);
window.addEventListener('resize', updateNavState);

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();

    const target = document.querySelector(this.getAttribute('href'));
    if (!target) return;

    const offset = nav.offsetHeight;
    const top = target.getBoundingClientRect().top + window.scrollY - offset + 1;

    window.scrollTo({
      top: top,
      behavior: 'smooth'
    });
  });
});

/* HERO WEBGL */

const container = document.getElementById('hero-webgl');
const loadingOverlay = document.getElementById('hero-loading');

let scene, camera, renderer;
let geometry, material, mesh, texture;
let mouse = new THREE.Vector2(0.5, 0.5);
let targetMouse = new THREE.Vector2(0.5, 0.5);
const clock = new THREE.Clock();
const frustumSize = 1;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uMouse;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uResolution;
  uniform float uAspect;

  vec2 displace(vec2 uv, vec2 center, float strength, float radius) {
    vec2 direction = uv - center;
    float safeLength = max(length(direction), 0.0001);
    vec2 safeDirection = direction / safeLength;

    vec2 aspectCorrectedDir = direction;
    aspectCorrectedDir.x *= uResolution.x / uResolution.y / uAspect;
    float aspectCorrectedDist = length(aspectCorrectedDir);

    float falloff = smoothstep(radius, 0.0, aspectCorrectedDist);
    float wave = sin(aspectCorrectedDist * 25.0 - uTime * 4.0);
    float displacementAmount = falloff * wave * strength * 0.05;

    return uv + safeDirection * displacementAmount;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    centeredUv.x *= uAspect;

    vec2 centeredMouse = uMouse - 0.5;
    centeredMouse.x *= uAspect;

    vec2 distortedUv = displace(centeredUv, centeredMouse, uIntensity, 0.28);
    distortedUv.x /= uAspect;
    distortedUv += 0.5;

    vec2 dir = centeredUv - centeredMouse;
    float dirLen = max(length(dir), 0.0001);
    vec2 safeDir = dir / dirLen;

    float chromaticAberrationAmount = pow(distance(centeredUv, centeredMouse), 2.0) * 0.008 * uIntensity;
    vec2 offsetR = safeDir * chromaticAberrationAmount * 0.5;
    vec2 offsetB = -safeDir * chromaticAberrationAmount * 0.5;

    vec4 colorR = texture2D(uTexture, distortedUv + offsetR);
    vec4 colorG = texture2D(uTexture, distortedUv);
    vec4 colorB = texture2D(uTexture, distortedUv + offsetB);

    vec4 finalColor = vec4(colorR.r, colorG.g, colorB.b, colorG.a);

    float vignette = smoothstep(0.75, 0.18, length((vUv - 0.5) * 1.15));
    finalColor.rgb *= vignette * 0.84 + 0.16;

    gl_FragColor = finalColor;
  }
`;

function getHeroSize() {
  return {
    width: hero.clientWidth,
    height: hero.clientHeight
  };
}

function initWebGL() {
  const { width, height } = getHeroSize();

  scene = new THREE.Scene();

  const aspect = width / height;

  camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
  );
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    './hero.png',
    loadedTexture => {
      texture = loadedTexture;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      const imageAspect = texture.image.naturalWidth / texture.image.naturalHeight;

      const planeHeight = frustumSize;
      const planeWidth = planeHeight * imageAspect;

      geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 32, 32);

      material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0.0 },
          uTexture: { value: texture },
          uMouse: { value: mouse.clone() },
          uIntensity: { value: 0.28 },
          uResolution: { value: new THREE.Vector2(width, height) },
          uAspect: { value: imageAspect }
        },
        transparent: true
      });

      mesh = new THREE.Mesh(geometry, material);
      fitMeshToHero(width, height, imageAspect);
      scene.add(mesh);

      loadingOverlay.classList.add('hidden');
      animate();
    },
    undefined,
    error => {
      console.error('Texture loading error:', error);
      loadingOverlay.innerHTML = '<p style="color:white;">Failed to load hero image.</p>';
    }
  );

  window.addEventListener('resize', onWindowResize);
  hero.addEventListener('mousemove', onHeroMouseMove);
  hero.addEventListener('mouseleave', onHeroMouseLeave);
}

function fitMeshToHero(width, height, imageAspect) {
  if (!mesh) return;

  const screenAspect = width / height;

  if (imageAspect > screenAspect) {
    mesh.scale.set(1, 1, 1);
  } else {
    const scaleFactor = screenAspect / imageAspect;
    mesh.scale.set(scaleFactor, scaleFactor, 1);
  }
}

function onWindowResize() {
  if (!camera || !renderer) return;

  const { width, height } = getHeroSize();
  const aspect = width / height;

  camera.left = frustumSize * aspect / -2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  if (material) {
    material.uniforms.uResolution.value.set(width, height);
    fitMeshToHero(width, height, material.uniforms.uAspect.value);
  }
}

function onHeroMouseMove(event) {
  const rect = hero.getBoundingClientRect();

  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  targetMouse.x = Math.max(0, Math.min(1, x));
  targetMouse.y = 1.0 - Math.max(0, Math.min(1, y));
}

function onHeroMouseLeave() {
  targetMouse.x = 0.5;
  targetMouse.y = 0.5;
}

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();
  const lerpFactor = 0.08;

  mouse.x += (targetMouse.x - mouse.x) * lerpFactor;
  mouse.y += (targetMouse.y - mouse.y) * lerpFactor;

  if (material) {
    material.uniforms.uTime.value = elapsedTime;
    material.uniforms.uMouse.value.copy(mouse);
  }

  renderer.render(scene, camera);
}

initWebGL();
