const {classes: Cc, interfaces: Ci, utils: Cu}=Components;
Cu.import('resource://gre/modules/Services.jsm');

let tabfocusStatic=
{
	enabled:true,
	objectList:[],
	loggingEnabled:false,

	log: function(str)
	{
		if(tabfocusStatic.loggingEnabled==true)
		{
			let logService=Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
			logService.logStringMessage("Tabfocus: "+str);
		}
	},
};

function TabfocusCallback()
{
	this.window=null;
	this.target=null;
	this.preferencesBranch=null;
}

function Tabfocus()
{
	this.preferencesBranch=Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.tabfocus.");
	this.preferencesDefaultBranch=Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getDefaultBranch("extensions.tabfocus.");
	this.window=null;

	this.tid=Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
	this.callback=new TabfocusCallback();
	this.callback.setPreferecesBranch(this.preferencesBranch);

	//preview-mode
	this.previewBaseTab=null;
	this.previewCallback=new TabfocusCallback();
	this.previewReturnTid=Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
}

TabfocusCallback.prototype.setTarget=function(target)
{
	this.target=target;
}

TabfocusCallback.prototype.setPreferecesBranch=function(preferencesBranch)
{
	this.preferencesBranch=preferencesBranch;
}

TabfocusCallback.prototype.setWindow=function(window)
{
	this.window=window;
}

TabfocusCallback.prototype.notify=function(timer)
{
	if(this.target!=null && this.window!=null)
	{
		this.window.gBrowser.selectedTab=this.target;

		//force reload if configured
		if(this.preferencesBranch!=null)
		{
			if(this.preferencesBranch.getBoolPref("forcereload"))
			{
				this.window.gBrowser.reloadTab(this.window.gBrowser.selectedTab);
			}
		}

		this.target=null;
	}
}

Tabfocus.prototype.load=function(window)
{
	//store the corresponding window for this object
	this.window=window;
	this.callback.setWindow(this.window);
	this.previewCallback.setWindow(this.window);

	//must be done at every startup
	this.setDefaultPreferences();

	//set initially selected tab
	this.previewBaseTab=this.window.gBrowser.selectedTab;

	//set event handlers
	this.window.gBrowser.tabContainer.addEventListener("mouseover",this.onMouseIn.bind(this), false);
	this.window.gBrowser.tabContainer.addEventListener("mouseout", this.onMouseOut.bind(this), false);
	this.window.gBrowser.tabContainer.addEventListener("click", this.onMouseClicked.bind(this), false);
};

Tabfocus.prototype.unload=function()
{
	//delete event handlers
	this.window.gBrowser.tabContainer.removeEventListener("mouseover", this.onMouseIn.bind(this), false);
	this.window.gBrowser.tabContainer.removeEventListener("mouseout", this.onMouseOut.bind(this), false);
	this.window.gBrowser.tabContainer.removeEventListener("click", this.onMouseClicked.bind(this), false);
};

Tabfocus.prototype.onMouseIn=function(e)
{
	//is extension enabled in preferences
	if(tabfocusStatic.enabled==true)
	{
		//get delay time
		let delay=this.preferencesBranch.getIntPref("delay");

		//check value
		if(delay<1)
		{
			//restore value with default entry
			delay=this.preferencesDefaultBranch.getIntPref("delay")
			this.preferencesBranch.setIntPref("delay", delay);
		}

		//clear preview-mode timeout
		this.tid.cancel();

		this.callback.setTarget(e.target);
		//switch after timeout
		this.tid.initWithCallback(this.callback, delay, this.tid.TYPE_ONE_SHOT);
	}
};

Tabfocus.prototype.onMouseOut=function()
{
	//reset timer
	this.tid.cancel();
	this.callback.setTarget(null);

	//if preview mode enabled
	if(this.preferencesBranch.getBoolPref("previewmode")==true && this.previewBaseTab!=null)
	{
		this.previewReturnTid.cancel();

		//get delay time
		let previewReturnDelay=this.preferencesBranch.getIntPref("returndelay");

		//check value
		if(previewReturnDelay<1)
		{
			//restore value with default entry
			previewReturnDelay=this.preferencesDefaultBranch.getIntPref("returndelay")
			this.preferencesBranch.setIntPref("returndelay", previewReturnDelay);
		}

		//restore tab
		this.previewCallback.setTarget(this.previewBaseTab);
		this.previewReturnTid.initWithCallback(this.previewCallback, previewReturnDelay, this.previewReturnTid.TYPE_ONE_SHOT);
	}
};

Tabfocus.prototype.onMouseClicked=function(e)
{
	//clear preview-mode timeout
	this.previewReturnTid.cancel();
	//set new return target for preview-mode
	this.previewCallback.setTarget(null);
	this.previewBaseTab=this.window.gBrowser.selectedTab;
};

Tabfocus.prototype.setDefaultPreferences=function()
{
	this.preferencesDefaultBranch.setIntPref("delay", 150);
	this.preferencesDefaultBranch.setBoolPref("previewmode", false);
	this.preferencesDefaultBranch.setIntPref("returndelay", 50);
	this.preferencesDefaultBranch.setBoolPref("forcereload", false);
};

function startup(data, reason)
{
	tabfocusStatic.enabled=true;
	tabfocusStatic.log("startup, instance count "+tabfocusStatic.objectList.length);

	var windows=Services.wm.getEnumerator("navigator:browser");
	while (windows.hasMoreElements())
	{
		let domwindow=windows.getNext().QueryInterface(Ci.nsIDOMWindow)
		if(domwindow!=null)
		{
			let obj=new Tabfocus();
			obj.load(domwindow);
			tabfocusStatic.objectList.push(obj);
			tabfocusStatic.log("startup, instance "+tabfocusStatic.objectList.length+" created");
		}
	}
	Services.wm.addListener(WindowListener);
}

function shutdown(data, reason)
{
	tabfocusStatic.enabled=false;
	tabfocusStatic.log("shutdown, instance count "+tabfocusStatic.objectList.length);

	if (reason==APP_SHUTDOWN)
	{
		return;
	}

	for(let i=0; i<tabfocusStatic.objectList.length; i++)
	{
		tabfocusStatic.objectList[i].unload();
		tabfocusStatic.log("instance "+(i+1)+" unloaded");
	}
	tabfocusStatic.objectList=[];
	tabfocusStatic.log("instances cleared, instance count "+tabfocusStatic.objectList.length);

	Services.wm.removeListener(WindowListener);

	// HACK WARNING: The Addon Manager does not properly clear all addon related caches on update;
	//               in order to fully update images and locales, their caches need clearing here
	Services.obs.notifyObservers(null, "chrome-flush-caches", null);
}

function install(data, reason)
{
	let obj=new Tabfocus();
	obj.setDefaultPreferences();
}

function uninstall(data, reason)
{
}

var WindowListener={
	onOpenWindow: function(xulWindow)
	{
		tabfocusStatic.log("window opened, instance count "+tabfocusStatic.objectList.length);

		var window=xulWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
		function onWindowLoad()
		{
			window.removeEventListener("load", onWindowLoad);
			if (window.document.documentElement.getAttribute("windowtype")=="navigator:browser")
			{
				let obj=new Tabfocus();
				obj.load(window);
				tabfocusStatic.objectList.push(obj);
				tabfocusStatic.log("instance "+tabfocusStatic.objectList.length+" created");
			}
		}
		window.addEventListener("load", onWindowLoad);
	},
	onCloseWindow: function(xulWindow)
	{
		tabfocusStatic.log("window closed, instance count "+tabfocusStatic.objectList.length);

		var window=xulWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);

		//check if an object was already attached to this window
		let windowFound=false;
		let obj=null;
		for(let i=0; i<tabfocusStatic.objectList.length && windowFound==false; i++)
		{
			obj=tabfocusStatic.objectList[i];
			if(obj.window==window)
			{
				obj.unload();
				tabfocusStatic.objectList.splice(i, 1);

				windowFound=true;
				tabfocusStatic.log("instance removed, instance count "+tabfocusStatic.objectList.length);
			}
		}
	},
	onWindowTitleChange: function(xulWindow, newTitle)
	{
	}
};
