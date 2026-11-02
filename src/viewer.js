import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const CREASE_ANGLE = Math.PI / 6; // keeps the hexagon's edges sharp and the oval smooth

/** A Z-up 3D view of one mesh, sized to `container`. */
export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  camera.position.set(1.2, -1.8, 2.2); // sets the initial view direction; frame() sets the distance
  scene.add(camera);

  const render = () => renderer.render(scene, camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2);
  keyLight.position.set(1, 1, 2);
  camera.add(keyLight); // the light follows the view, so no side of the knob goes dark

  const grid = new THREE.GridHelper(210, 21, 0x667085, 0x3a4252); // the i3 Mega's bed
  grid.rotateX(Math.PI / 2);
  scene.add(grid);

  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xe0883a, roughness: 0.55 }),
  );
  scene.add(mesh);

  new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }).observe(container);

  return {
    show({ positions, indices }) {
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      indexed.setIndex(new THREE.BufferAttribute(indices, 1));

      mesh.geometry.dispose();
      mesh.geometry = toCreasedNormals(indexed, CREASE_ANGLE);
      indexed.dispose();

      render();
    },

    /** Fits the mesh in view from the current viewing angle. */
    frame() {
      if (!mesh.geometry.attributes.position.count) return;
      mesh.geometry.computeBoundingSphere();
      const { center, radius } = mesh.geometry.boundingSphere;
      const direction = camera.position.clone().sub(controls.target).normalize();
      // Read the size now: a view that was just unhidden has not been resized yet.
      const aspect = container.clientWidth / container.clientHeight || camera.aspect;
      const halfHeight = THREE.MathUtils.degToRad(camera.fov / 2);
      const halfWidth = Math.atan(Math.tan(halfHeight) * aspect);
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, (1.15 * radius) / Math.sin(Math.min(halfHeight, halfWidth)));
      controls.update();
      render();
    },

    /** @returns {DataView} binary STL, units in mm */
    toStl: () => new STLExporter().parse(mesh, { binary: true }),
  };
}
