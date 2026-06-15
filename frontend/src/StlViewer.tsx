import React, { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, View, Platform } from 'react-native';

// Renders a binary STL (base64) inside a WebView using Three.js.
// Allows rotate / pinch zoom via OrbitControls.
export default function StlViewer({ stlBase64, height = 320 }: { stlBase64: string; height?: number }) {
  const html = useMemo(() => `
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:#05050A;overflow:hidden;height:100%;}
  #c{width:100%;height:100%;display:block;}
  .tag{position:absolute;bottom:10px;right:12px;color:#A1A1AA;font:9px/1 ui-monospace,Menlo,monospace;letter-spacing:2px;}
</style>
</head><body>
<canvas id="c"></canvas>
<div class="tag">STL · ORBIT · PINCH</div>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/STLLoader.js"></script>
<script>
  const b64 = "${stlBase64}";
  function b64ToArrayBuffer(b64){const bin=atob(b64);const len=bin.length;const buf=new ArrayBuffer(len);const view=new Uint8Array(buf);for(let i=0;i<len;i++)view[i]=bin.charCodeAt(i);return buf;}
  const canvas = document.getElementById('c');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050A);
  // grid
  const grid = new THREE.GridHelper(200, 20, 0x2563EB, 0x1F1F3A);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth/canvas.clientHeight, 0.1, 1000);
  camera.position.set(80, -80, 80);
  camera.up.set(0,0,1);
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const light1 = new THREE.DirectionalLight(0xffffff, 1.2); light1.position.set(1,1,2); scene.add(light1);
  const light2 = new THREE.HemisphereLight(0x22D3EE, 0x18181B, 0.6); scene.add(light2);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  try {
    const loader = new THREE.STLLoader();
    const geom = loader.parse(b64ToArrayBuffer(b64));
    geom.computeBoundingBox();
    const c = new THREE.Vector3();
    geom.boundingBox.getCenter(c);
    geom.translate(-c.x, -c.y, -c.z);
    const mat = new THREE.MeshStandardMaterial({color:0xF97316, metalness:0.2, roughness:0.6, flatShading:true});
    const mesh = new THREE.Mesh(geom, mat);
    scene.add(mesh);
    // Wireframe overlay
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geom), new THREE.LineBasicMaterial({color:0x22D3EE, transparent:true, opacity:0.18}));
    scene.add(wire);
    // Fit camera
    const size = new THREE.Vector3(); geom.boundingBox.getSize(size);
    const max = Math.max(size.x, size.y, size.z) || 30;
    camera.position.set(max*1.8, -max*1.8, max*1.4);
    controls.target.set(0,0,0);
  } catch(e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage('stl-err:'+e.message);
  }
  function resize(){renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = canvas.clientWidth/canvas.clientHeight; camera.updateProjectionMatrix();}
  window.addEventListener('resize', resize);
  let t = 0;
  function animate(){t+=0.005; controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate);}
  animate();
</script>
</body></html>`, [stlBase64]);

  // Web fallback shouldn't break the page; render a small placeholder
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fallback, { height }]} />
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
        scrollEnabled={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 4, overflow: 'hidden', backgroundColor: '#05050A' },
  web: { flex: 1, backgroundColor: '#05050A' },
  fallback: { width: '100%', backgroundColor: '#0F0F1A', borderRadius: 4 },
});
