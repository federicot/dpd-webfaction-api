var Resource = require('deployd/lib/resource');
var util = require('util');
var webfaction = require('webfaction-api');
var q = require('q');

function Webfaction(name, options) {
    Resource.apply(this, arguments);
}

util.inherits(Webfaction, Resource);

Webfaction.events = ['Get', 'Validate', 'Post', 'Put', 'Delete'];

Webfaction.prototype.clientGeneration = true;

Webfaction.basicDashboard = {
    settings: [
    {
        name        : 'username',
        type        : 'text',
        description : 'Username'
    }, {
        name        : 'password',
        type        : 'password',
        description : 'Password'
    }
]};

Webfaction.prototype.handle = function (ctx, next) {

    var self = this;
    this.ctx = ctx;

    var parts = this.ctx.url.split('/').filter(function(p) { return p; });
    var result = {};
    var domain = {
            url: this.ctx.url
        , parts: parts
        , query: this.ctx.query
        , body: this.ctx.body
        , 'this': result
        , setResult: function(val) {
            result = val;
        }
    };

    if (this.ctx.method === "GET" && this.events.Get) {
        this.events.Get.run(ctx, domain, function(err) {
            if (err) {
                return self.ctx.done(err, result);
            }

            self.continue();
        });
    }

};

Webfaction.prototype.login = function(force) {
    var self = this;
    force = (force) ? true : false;
    // Get webfaction object from session or create a new one if its not there
    this.wf = (this.ctx.session.data.wf) ? this.ctx.session.data.wf : new webfaction(this.config.username, this.config.password);

    // If webfaction object is in session and this is not a forced login call, return a resolved promise
    if (!force && this.wf.session_id) {
        return q.fcall(function() {return [self.wf.session_id, self.wf.account]});
    }

    // Call the api
    return this.wf.login().then(function(res) {
        self.ctx.session.set({wf: self.wf});
        return res;
    });
};

Webfaction.prototype.methodCall = function(method) {
    var self = this;

    // Try to login first
    return this.login()
    .then(function() {
        // Login success (this may be also a cached and expired session)
        // Call the action method
        return self.wf[method]()
        .then(function(res) {
            // Everything is fine, return the data
            return res;
        }, function() {
            // It seems the session is expired
            // Force login and try again
            return self.login(true)
            .then(function() {
                // Try to call the action method again
                return self.wf[method]()
                .then(function(res){
                    // Everything is fine, return the data
                    return res;
                }, function(err) {
                    // Something is wrong, this promise is rejected
                    return err;
                });
            }, function(err) {
                // Forced login failed too, reject promise
                return err;
            });
        });
    }, function(err){
        // Login failed, reject promise
        return err;
    });
};

Webfaction.prototype.continue = function() {
    var self = this;
    var promise;

    switch(this.ctx.url) {
    case '/login':
        promise = this.login(true);
        break;
    case '/list_app_types':
        promise = this.methodCall('listAppTypes');
        break;
    case '/list_domains':
        promise = this.methodCall('listDomains');
        break;
    case '/list_apps':
        promise = this.methodCall('listApps');
        break;
    case '/list_websites':
        promise = this.methodCall('listWebsites');
        break;
    case '/list_ips':
        promise = this.methodCall('listIps');
        break;
    case '/list_machines':
        promise = this.methodCall('listMachines');
        break;
    default:
        promise = q.fcall(function() {
            throw {message: 'Unknow endpoint \''+self.ctx.url+'\'', statusCode: 404};
        });
        break;
    }

    promise.then(function(res) {
        self.ctx.done(null, res);
    }, function(err) {
        self.ctx.done(err);
    });
};

module.exports = Webfaction;
