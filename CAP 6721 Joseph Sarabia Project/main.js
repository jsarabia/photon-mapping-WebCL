/*
	Joseph Sarabia
	CAP 6721
	Project
	4/21/14
*/

//var sceneLoc = "CornellBoxModelDiffuse.json";
var sceneLoc = "Cornellteapot.json";
//var sceneLoc = "Cornellglassbox.json";
var samples = 5000;
var radius = .1;
var iter = 10;
var photonIndex = [];
var photons = [];
var activelist = [];
var nextlist = [];
var nodelist = [];
var photonMap = 0;

function main(){
	 
	var maxint = 2147483647;

	var cl = WebCL.createContext ();
	var device = cl.getInfo(WebCL.CONTEXT_DEVICES)[0];
	var cmdQueue = cl.createCommandQueue (device, 0);
	var programSrc = loadKernel("photontrace");
	var program = cl.createProgram(programSrc);
	try {
		program.build ([device], "");
	} catch(e) {
		alert ("Failed to build WebCL program. Error "
		   + program.getBuildInfo (device, WebCL.PROGRAM_BUILD_STATUS)
		   + ":  " + program.getBuildInfo (device, WebCL.PROGRAM_BUILD_LOG));
		throw e;
	}
	var kernelName = "photontrace";
	try {
		kernel = program.createKernel (kernelName);
	} catch(e){
		alert("No kernel with name:"+ kernelName+" is found.");
		throw e;
	}

	


	var scene = new Scene(sceneLoc);
	var canvas = document.getElementById("canvas");
	var width=canvas.width, height=canvas.height;
	var canvasContext=canvas.getContext("2d");
	var canvasContent = canvasContext.createImageData(width,height);
	var nPixels = width*height;
	var nChannels = 4;
	var pixelBufferSize = nChannels*nPixels*4;
	var pixelBuffer = cl.createBuffer(WebCL.MEM_READ_WRITE,pixelBufferSize);
	var cameraBufferSize = 40;
	var cameraBuffer = cl.createBuffer(WebCL.MEM_WRITE_ONLY, cameraBufferSize);
	// [eye,at,up,fov]
	var cameraBufferData = new Float32Array([0,0,1,0,0,0,0,1,0,90]);
	var cameraObj = scene.getViewSpec(0);
	if (cameraObj)
	{
		cameraBufferData[0] = cameraObj.eye[0];
		cameraBufferData[1] = cameraObj.eye[1];
		cameraBufferData[2] = cameraObj.eye[2];
		cameraBufferData[3] = cameraObj.at[0];
		cameraBufferData[4] = cameraObj.at[1];
		cameraBufferData[5] = cameraObj.at[2];
		cameraBufferData[6] = cameraObj.up[0];
		cameraBufferData[7] = cameraObj.up[1];
		cameraBufferData[8] = cameraObj.up[2];
		cameraBufferData[9] = cameraObj.fov;
	}

	var triangleBufferSize = scene.getTriangleBufferSize();
	var triangleBuffer = cl.createBuffer(WebCL.MEM_WRITE_ONLY,(triangleBufferSize)?triangleBufferSize:1);
	var nTriangles = scene.getNtriangles();

	var sceneData = scene.getTriangleBufferData();

	var nMaterials = scene.getNmaterials();
	var materialBufferSize = scene.getMaterialBufferSize();
	var materialBuffer = cl.createBuffer(WebCL.MEM_WRITE_ONLY, (materialBufferSize)?materialBufferSize:40);

	var pixelBufferData = new Float32Array(pixelBufferSize);
	for(var i = 0; i<pixelBufferSize; i++)
		pixelBufferData[i] = 0.;

	//light buffer is of form [xmin, zmin, xmax, zmax, y, area, intensityr, intesityg, intensityb]
	var lightBufferData = new Float32Array([-.24, -.22, .23, .26, 1.98, .1316, 25, 25, 20]);

	var lightBufferSize = 36;
	var lightBuffer = cl.createBuffer(WebCL.MEM_WRITE_ONLY, lightBufferSize);
	canvasBufferSize = nChannels*nPixels;
	canvasBuffer = cl.createBuffer(WebCL.MEM_WRITE_ONLY,canvasBufferSize);
	var randomBuffer = cl.createBuffer(WebCL.MEM_READ_WRITE, nPixels*2*4+1);
	var randomData = [];
	for(var i = 0; i < nPixels*2+1; i++){
		var seed = Math.random() * maxint;		
		if(seed < 2) seed = 2;
		randomData[i] = seed;
	}
					var directPhotons = [];
					var nPhotons = 0;
					
					console.log("starting");
					var i = 0;
					var power = [255/samples, 197/samples, 143/samples];
					var triangles = scene.getTriangleBufferData();
					var materialData = scene.getMaterialBufferData();
					
					/*
						The following commented code is for photon shooting on CPU
					*/
					// for(i = 0; i<samples; i++){
						
					// 	var ray = {};
					// 	var perp = [1, 0, 0];
					// 	var norm = [0,-1,0];
					// 	var refInd1 = 1;
					// 	var refInd2 = 1.5;
					// 	var caustic = false;

					// 	power = [255/samples, 197/samples, 143/samples];
					// 	ray.origin = sampleLightSource(lightBufferData);
					// 	ray = sampleHemisphere(ray.origin, norm, perp);
					// 	//console.log(ray);
					// 	var intersection = raySceneIntersect(triangles, nTriangles, ray);

						
					// 	//for(var k = 0; k<5; k++) {
					// 	while(true){

					// 		if(intersection.i == -1){break;}

					// 		var point = rayPoint(ray, intersection.t);
					// 		var matIndex = triangles[(19*intersection.i)+18];
					// 		var kdiff = [materialData[(matIndex*9)], materialData[(matIndex*9)+1], materialData[(matIndex*9)+2]];
					// 		var n0 = [triangles[(19*intersection.i)+9],triangles[(19*intersection.i)+10],triangles[(19*intersection.i)+11]];
					// 		var n1 = [triangles[(19*intersection.i)+12],triangles[(19*intersection.i)+13],triangles[(19*intersection.i)+14]];
					// 		var n2 = [triangles[(19*intersection.i)+15],triangles[(19*intersection.i)+16],triangles[(19*intersection.i)+17]];
					// 		//get normal
					// 		var norm = [(intersection.a*n1[0])+(intersection.b*n2[0])+(intersection.c*n0[0]),
					// 									(intersection.a*n1[1])+(intersection.b*n2[1])+(intersection.c*n0[1]),
					// 									(intersection.a*n1[2])+(intersection.b*n2[2])+(intersection.c*n0[2])];
					// 		norm = normalize(norm);

					// 		//refract until you get to a diffuse surface
					// 		var count = 0;
					// 		while(kdiff[0] < .001 && kdiff[1] < .001 && kdiff[2] < .001 && count < 2 ){
					// 			if(count > 2) {
					// 			console.log("got to 3");
					// 			break;
					// 			}
					// 			ray = refractionRay(ray, point, norm, 1, 1.55);
					// 			intersection = raySceneIntersect(triangles, nTriangles, ray);
					// 			if(intersection.i == -1){break;}
					// 			n0 = [triangles[(19*intersection.i)+9],triangles[(19*intersection.i)+10],triangles[(19*intersection.i)+11]];
					// 			n1 = [triangles[(19*intersection.i)+12],triangles[(19*intersection.i)+13],triangles[(19*intersection.i)+14]];
					// 			n2 = [triangles[(19*intersection.i)+15],triangles[(19*intersection.i)+16],triangles[(19*intersection.i)+17]];
					// 			//get normal
					// 			norm = [(intersection.a*n1[0])+(intersection.b*n2[0])+(intersection.c*n0[0]),
					// 										(intersection.a*n1[1])+(intersection.b*n2[1])+(intersection.c*n0[1]),
					// 										(intersection.a*n1[2])+(intersection.b*n2[2])+(intersection.c*n0[2])];
					// 			norm = normalize(norm);
					// 			point = rayPoint(ray, intersection.t);
					// 			matIndex = triangles[(19*intersection.i)+18];
					// 			kdiff = [materialData[(matIndex*9)], materialData[(matIndex*9)+1], materialData[(matIndex*9)+2]];
					// 			count++;
					// 			console.log("refraction");
					// 		}
					// 		if(count > 2) {
					// 			console.log("got to 3");
					// 			break;
					// 		}
					// 		if(intersection.i == -1){break;}
					// 		if(kdiff[0] > .001 && kdiff[1] > .001 && kdiff[2] > .001){
					// 			directPhotons.push(point[0]);
					// 			directPhotons.push(point[1]);
					// 			directPhotons.push(point[2]);
					// 			directPhotons.push(ray.direction[0]);
					// 			directPhotons.push(ray.direction[1]);
					// 			directPhotons.push(ray.direction[2]);
					// 			directPhotons.push(power[0]);
					// 			directPhotons.push(power[1]);
					// 			directPhotons.push(power[2]);
					// 			nPhotons++;
								
					// 			var powerMag = Math.sqrt((power[0]*power[0])+(power[1]*power[1])+(power[2]*power[2]));
					// 			var powRef = normalize([power[0]*kdiff[0], power[1]*kdiff[1], power[2]*kdiff[2]]);
					// 			power = [powRef[0]*powerMag, powRef[1]*powerMag, powRef[2]*powerMag];
					// 		}	
						
					// 		var rnd = Math.random();
					// 		var p0 = [triangles[(19*intersection.i)+0],triangles[(19*intersection.i)+1],triangles[(19*intersection.i)+2]];
					// 		var p1 = [triangles[(19*intersection.i)+3],triangles[(19*intersection.i)+4],triangles[(19*intersection.i)+5]];
					// 		perp = normalize([p0[0]-p1[0],p0[1]-p1[1],p0[2]-p1[2]]);
					// 		if(Math.max(kdiff[0],kdiff[1],kdiff[2]) < rnd){
					// 		//if(1.1 < rnd){
					// 			break;
					// 		}
														
					// 		ray.origin = point;
					// 		ray = sampleHemisphere(ray.origin, norm, perp);	

					// 		intersection = raySceneIntersect(triangles, nTriangles, ray);
												
					// 	}
												
					// }

	var photonBuffer = cl.createBuffer(WebCL.MEM_READ_WRITE, samples*4*45);
	// console.log(nPhotons);
	// console.log(directPhotons);

	

	var seedBuffer = cl.createBuffer(WebCL.MEM_READ_WRITE, samples*5*4);
	var seedData = [];
	for(var i = 0; i < samples*5; i++){
		var seed = Math.random() * maxint;		
		if(seed < 2) seed = 2;
		seedData[i] = seed;
	}

	directPhotons = new Float32Array(samples*45);
	
	kernel.setArg(0, photonBuffer);	
	kernel.setArg(1, triangleBuffer);
	kernel.setArg(2, new Int32Array([nTriangles]));
	kernel.setArg(3, new Int32Array([samples]));
	kernel.setArg(4, new Int32Array([nMaterials]));
	kernel.setArg(5, materialBuffer);
	kernel.setArg(6, lightBuffer);
	kernel.setArg(7, seedBuffer);


	var dim = 2;
	var maxWorkElements = kernel.getWorkGroupInfo(device,webCL.KERNEL_WORK_GROUP_SIZE);// WorkElements in ComputeUnit
	var xSize = Math.floor(Math.sqrt(maxWorkElements));
	var ySize = Math.floor(maxWorkElements/xSize);
	var localWS = [xSize];
	var globalWS = [Math.ceil(samples/xSize)*xSize];

	var clear=[];
	for(var i = 0; i < samples*45; i++){
		clear.push(-1);
	}

	cmdQueue.enqueueWriteBuffer(triangleBuffer, false, 0, triangleBufferSize, scene.getTriangleBufferData());
	cmdQueue.enqueueWriteBuffer(materialBuffer, false, 0, materialBufferSize, scene.getMaterialBufferData());
	cmdQueue.enqueueWriteBuffer(lightBuffer, false, 0, lightBufferSize, lightBufferData);
	cmdQueue.enqueueWriteBuffer(seedBuffer, false, 0, samples*4*5, new Uint32Array(seedData));
	cmdQueue.enqueueWriteBuffer(photonBuffer, false, 0, clear.length*4, new Float32Array(clear));


	cmdQueue.enqueueNDRangeKernel(kernel,globalWS.length,null,globalWS,localWS);
	cmdQueue.enqueueReadBuffer(photonBuffer,false,0,samples*4*45,directPhotons);

	cmdQueue.finish();
	
	for(var i = 0; i < directPhotons.length; i+=9)
	{
		//if(directPhotons[i+6] == -1 && directPhotons[i+7] == -1 && directPhotons[i+8] == -1){
		if(directPhotons[i+6] > .00000000001 && directPhotons[i+7] > .000000001 && directPhotons[i+8] > .00000001){
			for(var j = 0; j < 9; j++){
				photons.push(directPhotons[i+j]);
			}
			nPhotons++;
		}
	}

	console.log("n photons is " + nPhotons);
	console.log("n samples is " + samples);
	//console.log(photons);
	//console.log(directPhotons);
	seedBuffer.release();

	for(var i = 0; i < photons.length; i+=9){
		photonIndex.push(i);
	}
	
	//createKDTree(scene.getBounds());
	//console.log(nodelist.length);


	// // // switch to regular ray tracing
	
	var programSrc = loadKernel("raytrace");
	var program = cl.createProgram(programSrc);
	try {
		program.build ([device], "");
	} catch(e) {
		alert ("Failed to build WebCL program. Error "
		   + program.getBuildInfo (device, WebCL.PROGRAM_BUILD_STATUS)
		   + ":  " + program.getBuildInfo (device, WebCL.PROGRAM_BUILD_LOG));
		throw e;
	}
	var kernelName = "raytrace";
	try {
		kernel = program.createKernel (kernelName);
	} catch(e){
		alert("No kernel with name:"+ kernelName+" is found.");
		throw e;
	}


	kernel.setArg(0, pixelBuffer);
	kernel.setArg(1, cameraBuffer);	
	kernel.setArg(2, triangleBuffer);
	kernel.setArg(3, new Int32Array([nTriangles]));
	kernel.setArg(4, new Int32Array([width]));
	kernel.setArg(5, new Int32Array([height]));
	kernel.setArg(6, new Int32Array([nMaterials]));
	kernel.setArg(7, materialBuffer);
	kernel.setArg(8, lightBuffer);
	kernel.setArg(9, randomBuffer);
	kernel.setArg(10, canvasBuffer);
	kernel.setArg(11, new Int32Array([iter]));
	kernel.setArg(12, photonBuffer);
	kernel.setArg(13, new Int32Array([nPhotons]));
	kernel.setArg(14, new Float32Array([radius]));
	kernel.setArg(15, new Int32Array([photonMap]));


	dim = 2;
	maxWorkElements = kernel.getWorkGroupInfo(device,webCL.KERNEL_WORK_GROUP_SIZE);// WorkElements in ComputeUnit
	xSize = Math.floor(Math.sqrt(maxWorkElements));
	ySize = Math.floor(maxWorkElements/xSize);
	localWS = [xSize, ySize];
	globalWS = [Math.ceil(width/xSize)*xSize, Math.ceil(height/ySize)*ySize];

	cmdQueue.enqueueWriteBuffer(pixelBuffer, false, 0, pixelBufferSize, new Float32Array(pixelBufferSize));
	cmdQueue.enqueueWriteBuffer(triangleBuffer, false, 0, triangleBufferSize, scene.getTriangleBufferData());
	cmdQueue.enqueueWriteBuffer(materialBuffer, false, 0, materialBufferSize, scene.getMaterialBufferData());
	cmdQueue.enqueueWriteBuffer(cameraBuffer, false, 0, cameraBufferSize, cameraBufferData);
	cmdQueue.enqueueWriteBuffer(lightBuffer, false, 0, lightBufferSize, lightBufferData);
	cmdQueue.enqueueWriteBuffer(randomBuffer, false, 0, nPixels*2*4+1, new Uint32Array(randomData));
	cmdQueue.enqueueWriteBuffer(photonBuffer, false, 0, photons.length*4, new Float32Array(photons));

	for(var i = 0; i < iter; i++){
		cmdQueue.enqueueNDRangeKernel(kernel,globalWS.length,null,globalWS,localWS);
	}


	cmdQueue.enqueueReadBuffer(canvasBuffer,false,0,canvasBufferSize,canvasContent.data);



	cmdQueue.finish();
	canvasContext.putImageData(canvasContent,0,0);
	pixelBuffer.release();
	cameraBuffer.release();
	triangleBuffer.release();
	materialBuffer.release();
	randomBuffer.release();
	lightBuffer.release();
	photonBuffer.release();
	canvasBuffer.release();
	cmdQueue.release();
	kernel.release();
	program.release();
	cl.releaseAll();
	cl.release();
}

function loadKernel(id){
  var kernelElement = document.getElementById(id);
  console.log(document.getElementById(id));
  var kernelSource = kernelElement.text;
  if (kernelElement.src != "") {
      var mHttpReq = new XMLHttpRequest();
      mHttpReq.open("GET", kernelElement.src, false);
      mHttpReq.send(null);
      kernelSource = mHttpReq.responseText;
  } 
  return kernelSource;
}

function switchstuff(){
	if(sceneLoc == "Cornellteapot.json"){
		//type = 1;
		sceneLoc = "CornellBoxModelDiffuse.json";
	}
	else {
		sceneLoc = "Cornellteapot.json";
		//type = 0;
	}
	main();
}
function mapHandler(){
	if(photonMap == 0)
		photonMap = 1;
	else photonMap = 0;
	main();
}
//document.getElementById("clickMe").onclick = switchstuff;

function radiusHandler(){
	radius = .1*document.getElementById("PNRadius").value;
	main();
}
function sampleHandler(){
	samples = document.getElementById("samples").value;
	main();
}
function iterationHandler(){
	iter = document.getElementById("iterations").value;
	main();
}


//takes in light buffer, returns a sample point from the light
function sampleLightSource(lightBuffer){
	var sx = Math.random();
	var sy = Math.random();
	var dx = lightBuffer[2] - lightBuffer[0];
	var dz = lightBuffer[3] - lightBuffer[1];
	var lightSample = [(sx*dx)+lightBuffer[0], 1.9799, (sy*dz)+lightBuffer[1]];

	return lightSample;
}
//assume that light normal is 0,-1,0
//returns a ray object
function sampleHemisphere(center, n, perp){
	
	var ray = {};
	ray.origin = center;
	var zd = Math.random();
	var phi = Math.PI*2*Math.random();
	var r = Math.sqrt(1-Math.pow(zd, 2));
	var xd = r * Math.cos(phi);
	var yd = r * Math.sin(phi);

	n = normalize(n);

	var u = normalize(cross(n, perp));
	var v = cross(n,u);
	var w = n;

	

	ray.direction = [xd*u[0] + yd*v[0] + zd*w[0], 
					xd*u[1] + yd*v[1] + zd*w[1],
					xd*u[2] + yd*v[2] + zd*w[2]];//(xd*u)+(yd*v)+(zd*w);
	
	return ray;
}
function dot(a, b){
	var sum = 0;
	for(var i = 0; i < a.length; i++){
		sum += a[i]*b[i];
	}
	return sum;
}
function cross(a, b){
	return [a[1]*b[2] - a[2]*b[1],
          a[2]*b[0] - a[0]*b[2],
          a[0]*b[1] - a[1]*b[0]];
}
//calculates the length of the vector, then divides each component by the length
function normalize(vector){
	var normalized = [];
	var sum = 0;
	for(var i = 0; i < vector.length; i++){
		sum += Math.pow(vector[i], 2);
	}
	sum = Math.sqrt(sum);
	for(var i = 0; i < vector.length; i++){
		normalized[i] = vector[i] / sum;
	}
	return normalized;
}
function raySceneIntersect(triangleData, triangles, ray){

	var t = {};
	t.t = Number.POSITIVE_INFINITY;;
	t.i = -1;
				
	//loop through triangle data by the indexes given through the cell buffer
	for (var j = 0; j < triangles; j++){

			var p0 = [triangleData[(19*j)+0],triangleData[(19*j)+1],triangleData[(19*j)+2]];
			var p1 = [triangleData[(19*j)+3],triangleData[(19*j)+4],triangleData[(19*j)+5]];
			var p2 = [triangleData[(19*j)+6],triangleData[(19*j)+7],triangleData[(19*j)+8]];
			var ttemp = rayTriangleIntersect(ray, p0, p1, p2, j);
			if(ttemp.t < t.t && ttemp.t > 0.0001){
				t = ttemp;
			}
	}

	return t;

}
function rayTriangleIntersect(ray, p0, p1, p2, i){
	var t = Number.POSITIVE_INFINITY;
	var tmin = {};
	tmin.t = Number.POSITIVE_INFINITY;
	tmin.i = -1;
	

	var p2p0 = [p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
	var p1p0 = [p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]];

	var normal = cross(p1p0, p2p0);
	if(dot(normal, ray.direction) != 0.){
		t = dot(normal, [p0[0] - ray.origin[0],p0[1] - ray.origin[1],p0[2] - ray.origin[2]]) / dot(normal, ray.direction);
		if(t > 0.00001){
			var point = rayPoint(ray,t);
			var a = dot(cross([point[0] - p0[0], point[1] - p0[1], point[2] - p0[2]], p2p0), normal)/(dot(normal,normal));
			if(a > 0.000000001){
				var b = dot(cross(p1p0, [point[0]-p0[0],point[1]-p0[1],point[2]-p0[2]]), normal)/(dot(normal,normal));
					if(b >=0.00000001 && a+b <= 1.00000001){
					
						if(tmin.t > t){
							tmin.t = t;
							tmin.i = i;
							tmin.a = a;
							tmin.b = b;
							tmin.c = 1 - a -b;
						}
						
					}
			}
		}
	}
		
	return tmin;
}
function rayPoint(ray, t){
	var off = [ray.direction[0]*t, ray.direction[1]*t, ray.direction[2]*t];
	return  [ray.origin[0]+off[0], ray.origin[1]+off[1], ray.origin[2]+off[2]];
}
function reflectionRay(normal, ray, point){
	var newRay = {};
	normal = normalize(normal);
	ray.direction = normalize(ray.direction);
	newRay.origin = point;
	var dotproduct = dot(normal, ray.direction);
	var part = [normal[0]*2*dotproduct, normal[1]*2*dotproduct, normal[2]*2*dotproduct];
	newRay.direction = [ray.direction[0]-part[0],ray.direction[1]-part[1],ray.direction[2]-part[2]];
	return newRay;
}

function refractionRay(ray, point, norm, n1, n2){
	var refl = {};
	refl.origin = point;
	var fres = n1/n2;
	var c1 = -1*dot([-1*norm[0],-1*norm[1],-1*norm[2]], normalize(ray.direction));
	var s = fres*fres*(1-c1*c1);
	var c2 = Math.sqrt(1-s);
	refl.direction = [(fres * ray.direction[0]) + ((fres*c1-c2)*norm[0]),
					(fres * ray.direction[1]) + ((fres*c1-c2)*norm[1]),
					(fres * ray.direction[2]) + ((fres*c1-c2)*norm[2])];


	return refl;
}

function createKDTree(bounds){

	var rootNode = [];

	//nodes should follow the format of [startIndex, lastIndex, splitPoint, splitAxis, minx, miny, minz, maxx, maxy, maxz, isLeaf];
	rootNode.push(0);
	rootNode.push(photonIndex.length);
	rootNode.push(bounds.min[0] + (bounds.max[0] - bounds.min[0])/2.0);
	rootNode.push(0);
	rootNode.push(bounds.min[0]);
	rootNode.push(bounds.min[1]);
	rootNode.push(bounds.min[2]);
	rootNode.push(bounds.max[0]);
	rootNode.push(bounds.max[1]);
	rootNode.push(bounds.max[2]);
	rootNode.push(0);

	for(var i = 0; i<11;i++)
		activelist.push(rootNode[i]);
	

	while(activelist.length > 0){
		//append active list to nodelist
		for(var i =0; i< activelist.length; i+=11){
			for(var j = 0; j<11; j++)
			nodelist.push(activelist[i + j]);
		}
		var allLeaves = true;
		//looks for a node that still needs to be broken down
		for(var i = 0; i< activelist.length; i+=11){
			if(activelist[i+10] == 0)
				allLeaves = false;
		}
		if(allLeaves){break;}
		nextlist = [];
		processLargeNodes();
		activelist = new Float32Array(nextlist);
		var allLeaves = 0;
		
	}

}


function processLargeNodes(){
	for(var i = 0; i<activelist.length; i+=11){
		if(activelist[i+10] == 1){//if leaf node but need to split, push two filler nodes
			for(var j = 0; j<10;j++){
				nextlist.push(-1);
			}
			nextlist.push(1);
			for(var j = 0; j<10;j++){
				nextlist.push(-1);
			}
			nextlist.push(1);
		}
		//based on splitting axis
		switch(activelist[i+3]){
			//case statements to pick the correct bounds to push, as well as splitpoint and axis
			case 0:
				//needs to return [start, end, start end]
				var splitAxis = 1;
				var splitPoint = activelist[i+5] + ((activelist[i+8] - activelist[i+5])/2.0);
				var indices = sort(activelist[i+0], activelist[i+1], activelist[i+2], activelist[i+3]);
				//[startIndex, lastIndex, splitPoint, splitAxis, minx, miny, minz, maxx, maxy, maxz, isLeaf];
				//splitpoint should be where the childnode is divided, not where it was divided
				nextlist.push(indices[0]);
				nextlist.push(indices[1]);
				//splitpoint set to maxx-minx/2, splitting along x axis
				nextlist.push(splitPoint);
				nextlist.push(1);
				nextlist.push(activelist[i+4]);
				nextlist.push(activelist[i+5]);
				nextlist.push(activelist[i+6]);
				nextlist.push(activelist[i+4] + (activelist[i+7] - activelist[i+4])/2.0);
				nextlist.push(activelist[i+8]);
				nextlist.push(activelist[i+9]);
				if(indices[1] - indices[0] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}

				nextlist.push(indices[2]);
				nextlist.push(indices[3]);
				nextlist.push(splitPoint);
				nextlist.push(1);
				nextlist.push(activelist[i+4] + (activelist[i+7] - activelist[i+4])/2.0);
				nextlist.push(activelist[i+5]);
				nextlist.push(activelist[i+6]);
				nextlist.push(activelist[i+7]);
				nextlist.push(activelist[i+8]);
				nextlist.push(activelist[i+9]);
				if(indices[3] - indices[2] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}
				break;
			case 1:
				var splitAxis = 2;
				var splitPoint = activelist[i+6] + (activelist[i+9] - activelist[i+6])/2.0;
				//needs to return [start, end, start end]
				var indices = sort(activelist[i+0], activelist[i+1],activelist[i+2], activelist[i+3]);
				//[startIndex, lastIndex, splitPoint, splitAxis, minx, miny, minz, maxx, maxy, maxz, isLeaf];
				nextlist.push(indices[0]);
				nextlist.push(indices[1]);
				nextlist.push(activelist[i+6] +(activelist[i+9] - activelist[i+6])/2.0);
				nextlist.push(splitAxis);
				nextlist.push(activelist[i+4]);
				nextlist.push(activelist[i+5]);
				nextlist.push(activelist[i+6]);
				nextlist.push(activelist[i+7]);
				nextlist.push(activelist[i+5] +(activelist[i+8] - activelist[i+5])/2.0);
				nextlist.push(activelist[i+9]);
				if(indices[1] - indices[0] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}

				nextlist.push(indices[2]);
				nextlist.push(indices[3]);
				nextlist.push(activelist[i+6] + (activelist[i+9] - activelist[i+6])/2.0);
				nextlist.push(splitAxis);
				nextlist.push(activelist[i+4]);
				nextlist.push(activelist[i+5] + (activelist[i+8] - activelist[i+5])/2.0);
				nextlist.push(activelist[i+6]);
				nextlist.push(activelist[i+7]);
				nextlist.push(activelist[i+8]);
				nextlist.push(activelist[i+9]);
				if(indices[3] - indices[2] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}
				break;
				case 2:

				var splitAxis = 0;
				var splitPoint = activelist[i+5] + (activelist[i+9] - activelist[i+5])/2.0;
				//needs to return [start, end, start end]
				var indices = sort(activelist[i+0], activelist[i+1], activelist[i+2], activelist[i+3]);
				//[startIndex, lastIndex, splitPoint, splitAxis, minx, miny, minz, maxx, maxy, maxz, isLeaf];
				nextlist.push(indices[0]);
				nextlist.push(indices[1]);
				nextlist.push(activelist[i+4] + (activelist[i+7] - activelist[i+4])/2.0);
				nextlist.push(splitAxis);
				nextlist.push(activelist[i+4]);
				nextlist.push(activelist[i+5]);
				nextlist.push(activelist[i+6]);
				nextlist.push(activelist[i+7]);
				nextlist.push(activelist[i+8]);
				nextlist.push(activelist[i+6] + (activelist[i+9] - activelist[i+6])/2.0);
				if(indices[1] - indices[0] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}

				nextlist.push(indices[2]);
				nextlist.push(indices[3]);
				nextlist.push(activelist[i+4] + (activelist[i+7] - activelist[i+4])/2.0);
				nextlist.push(splitAxis);
				nextlist.push(activelist[i+4]);
				nextlist.push(activelist[i+5]);
				nextlist.push(activelist[i+6] + (activelist[i+9] - activelist[i+6])/2.0);
				nextlist.push(activelist[i+7]);
				nextlist.push(activelist[i+8]);
				nextlist.push(activelist[i+9]);
				if(indices[3] - indices[2] > 200)
					nextlist.push(0);
				else{
					nextlist.push(1);
				}
				break;

		}

	}
}
function sort(start, end, point, axis){
	var left = [];
	var right = [];
	
	for(var i = start; i < end; i++){

		if(photons[photonIndex[i]+axis] < point){
			left.push(photonIndex[i]);
			//console.log("placed left");
		}
		else {
			right.push(photonIndex[i]);
			//console.log("placed right");
		}
	}
	for(var i = 0; i < left.length; i++){
		photonIndex[i+start] = left[i]; 
	}
	for(var i = 0; i< right.length;i++){
		photonIndex[i+start+left.length] = right[i];
	}
	var returnArray = [start, start+left.length, start+left.length, end];
	return returnArray;
}