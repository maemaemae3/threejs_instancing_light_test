const lam_vert = [
    "#define LAMBERT",
    "",
    "attribute vec3 translation;",
    "attribute vec4 orientation;",
    "attribute vec3 scale;",
    "varying vec3 vLightFront;",
    "varying vec3 vIndirectFront;",
    "",
    "#include <common>",
    "#include <uv2_pars_vertex>",
    "#include <bsdfs>",
    "#include <lights_pars_begin>",
    "#include <fog_pars_vertex>",
    "#include <shadowmap_pars_vertex>",
    "varying vec2 vUv;",
    "",
    "void main() {",
    "",
    "    #include <beginnormal_vertex>",
    "    #include <defaultnormal_vertex>",
    "",
    "    #include <begin_vertex>",
    "    #include <worldpos_vertex>",
    "",
    "    vUv = uv;",
    "    transformed *= scale;",
    "    vec3 vcV = cross(orientation.xyz, transformed);",
    "    transformed = vcV * (2.0 * orientation.w) + (cross(orientation.xyz, vcV) * 2.0 + transformed);",
    "    vec4 mvPosition = modelViewMatrix * vec4(translation + transformed, 1.0);",
    "    ",
    "    gl_Position = projectionMatrix * mvPosition;",
    "    ",
    "    #include <lights_lambert_vertex>",
    "    #include <shadowmap_vertex>",
    "    #include <fog_vertex>",
    "}"
    ].join("\n");

const lam_frag = [
    "uniform vec3 diffuse;",
    "uniform vec3 emissive;",
    "uniform float opacity;",
    "",
    "varying vec3 vLightFront;",
    "varying vec3 vIndirectFront;",
    "",
    "#include <common>",
    "#include <packing>",
    "#include <uv2_pars_fragment>",
    "#include <lightmap_pars_fragment>",
    "#include <emissivemap_pars_fragment>",
    "#include <bsdfs>",
    "#include <lights_pars_begin>",
    "#include <fog_pars_fragment>",
    "#include <shadowmap_pars_fragment>",
    "#include <shadowmask_pars_fragment>",
    "#include <specularmap_pars_fragment>",
    "uniform sampler2D map;",
    "varying vec2 vUv;",
    "",
    "void main() {",
    "",
    "	#include <clipping_planes_fragment>",
    "",
    "	vec4 diffuseColor = vec4( diffuse, opacity );",
    "	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );",
    "	vec3 totalEmissiveRadiance = emissive;",
    "",
    "   vec4 texelColor = texture2D( map, vUv );",
    "",
    "   texelColor = mapTexelToLinear( texelColor );",
    "   diffuseColor *= texelColor;",
    "	#include <specularmap_fragment>",
    "	#include <emissivemap_fragment>",
    "",
    "	// accumulation",
    "	reflectedLight.indirectDiffuse = getAmbientLightIrradiance( ambientLightColor );",
    "	reflectedLight.indirectDiffuse += vIndirectFront;",
    "",
    "	#include <lightmap_fragment>",
    "",
    "	reflectedLight.indirectDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb );",
    "	reflectedLight.directDiffuse = vLightFront;",
    "	reflectedLight.directDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb ) * getShadowMask();",
    "",
    "	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
    "",
    "	gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
    "",
    "	#include <fog_fragment>",
    "",
    "}"
    ].join("\n");

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 100000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const controls = new THREE.OrbitControls(camera, renderer.domElement);
const loader   = new THREE.GLTFLoader();

const instances = 20;
const scales       = new THREE.InstancedBufferAttribute(new Float32Array(instances * 3), 3, false);
const translations = new THREE.InstancedBufferAttribute(new Float32Array(instances * 3), 3, false);
const orientations = new THREE.InstancedBufferAttribute(new Float32Array(instances * 4), 4, false).setDynamic(true);
let box, single_box;

function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function object() {
    function makeObjects(igeo, mat) {
        const material = new THREE.ShaderMaterial({
            vertexShader   : lam_vert,
            fragmentShader : lam_frag,
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.common,
                THREE.UniformsLib.specularmap,
                THREE.UniformsLib.envmap,
                THREE.UniformsLib.aomap,
                THREE.UniformsLib.lightmap,
                THREE.UniformsLib.emissivemap,
                THREE.UniformsLib.fog,
                THREE.UniformsLib.lights,
                { map: { type: 't', value: null } }
            ]),
            lights: true
        });
        material.uniforms.map.value = mat.map;

        for (var i = 0; i < instances; i++) {
            // translations
            const position = new THREE.Vector3();
            position.x = Math.random() * 2000;
            position.y = 0;
            position.z = Math.random() * 2000;

            translations.setXYZ(i, position.x, position.y, position.z);

            // orientations
            const rotation = new THREE.Euler();
            rotation.x = 0;
            rotation.y = Math.random() * Math.PI * 2;
            rotation.z = 0;
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(rotation, false);
            orientations.setXYZW(i, quaternion.x, quaternion.y, quaternion.z, quaternion.w);

            const scale = 50;
            scales.setXYZ(i, scale, scale, scale);
        }

        igeo.addAttribute('scale', scales);
        igeo.addAttribute('translation', translations);
        igeo.addAttribute('orientation', orientations);

        const mesh = new THREE.Mesh(igeo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
    }

    loader.load("./models/b.glb", function (gltf) {

        let igeo;
        let material;
        gltf.scene.traverse(function (node) { // need to traverse in scene object, because object hierarcy are software specific.
            if (node.isMesh) {
                igeo     = new THREE.InstancedBufferGeometry().copy(node.geometry);
                material = node.material;
            }
        });

        makeObjects(igeo, material);
    });
}

window.onload = function () {
    camera.position.x = 0;
    camera.position.y = 5000;
    camera.position.z = 5000;
    
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    controls.target = new THREE.Vector3(0, 0, 0);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.gammaOutput = true;
    renderer.setClearColor(0x666666, 1.0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onResize);
    onResize();

    //ground plane
    const grid = new THREE.GridHelper(5000, 100);
    scene.add(grid);

    const ambientLight = new THREE.AmbientLight(0xFFFFFF);
    const intensity = 1.0;
    ambientLight.color.setRGB(
        ambientLight.color.r * intensity,
        ambientLight.color.g * intensity,
        ambientLight.color.b * intensity);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xFFFFFF, 0.5);
    dirLight.castShadow = true;
    dirLight.position.set(500, 300, 500);
    dirLight.shadow.darkness      =  0.2;
    dirLight.shadow.camera.near   =  1;
    dirLight.shadow.camera.far    =  1000;
    dirLight.shadow.camera.right  =  500;
    dirLight.shadow.camera.left   = -500;
    dirLight.shadow.camera.top    =  500;
    dirLight.shadow.camera.bottom = -500;
    dirLight.shadow.camera.near   =  0.5;
    scene.add(dirLight);
    const light_helper = new THREE.CameraHelper(dirLight.shadow.camera);
    scene.add(light_helper);

    const geometry = new THREE.BoxBufferGeometry(200, 200, 200);
    const material = new THREE.MeshLambertMaterial({color: 0x6699FF});
    box = new THREE.Mesh(geometry, material);
    box.position.set(-500, 0, -500);
    scene.add(box);
    

    loader.load("./models/b.glb", function (gltf) {
        single_box = gltf.scene;
        single_box.position.set(500, 0, -500);
        single_box.scale.set(100, 100, 100);
        scene.add(single_box);
    });

    object();
    update();
};

function createRotQuarternion(xx, yy, zz, deg) {
    const factor = Math.sin(deg / 2.0);

    // Calculate the x, y and z of the quaternion
    const x = xx * factor;
    const y = yy * factor;
    const z = zz * factor;

    // Calcualte the w value by cos(theta / 2)
    const w = Math.cos(deg / 2.0);

    return new THREE.Quaternion(x, y, z, w).normalize();
}

function update() {
    requestAnimationFrame(update);

    box.rotation.y += 0.02;
    single_box.rotation.y += 0.02;
    
    for (let i = 0; i < instances; i++) {
        const ox = orientations.getX(i);
        const oy = orientations.getY(i);
        const oz = orientations.getZ(i);
        const ow = orientations.getW(i);
    
        const rot = new THREE.Quaternion(ox, oy, oz, ow);
        rot.multiply(createRotQuarternion(0, 1, 0, (1 * Math.PI) / 180));
        orientations.setXYZW(i, rot.x, rot.y, rot.z, rot.w);
    }
    orientations.needsUpdate = true;

    renderer.render(scene, camera);
}