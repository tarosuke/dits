target := $(shell echo $$PWD | sed s!.*/!! )

all: $(target)

.PHONY : clean test watch uninstall doxygen setup
.DELETE_ON_ERROR : $(wildcard build/*)


####################################################################### VALUES

COPTS = -Itoolbox/include
LIBOPTS = -Ltoolbox

COPTS += -Wall -Werror -g -O2 -fno-strict-aliasing -Wno-unused-result -Icore/include -DPROJECT_NAME=\"$(target)\"
CCOPTS += $(COPTS) -std=c++11


libs = toolbox c m stdc++ pthread gdbm git2
LIBOPTS += -z noexecstack -Xlinker "--cref"
LIBOPTS += $(addprefix -l, $(libs))

srcpath = core
srcs = $(foreach p, $(srcpath), $(shell find $(p) -name "*.cc" -o -name "*.c" -o -name "*.glsl"))

dirs = $(sort $(dir $(srcs)))
mods = $(basename $(srcs))
dmds= $(addprefix build/, $(mods))
objs = $(addsuffix .o, $(dmds)) $(exobjs)
deps = $(addsuffix .d, $(dmds))


################################################################### EXTRA RULES

exdeps = toolbox/toolbox.a

toolbox/toolbox.a:
	make -j -C toolbox


######################################################################## RULES

$(target): makefile $(objs) $(exdeps)
	@echo " LD $@" $(LIBOPTS)
	@gcc  $(CCOPTS) -Xlinker "-Map=$(target).map" -o $@ $(objs) $(LIBOPTS)

test: $(target)
	./$(target) --verbose=2

setup:
	@sudo cp data/10-vr_core.rules /etc/udev/rules.d
	@sudo udevadm trigger

install: $(target)
	@sudo cp $(target) /usr/local/bin
	@sudo cp data/vr_core.rules /etc/udev/rules.d

uninstall:
	@sudo rm -f /usr/local/bin/$(target)
	@sudo rm -f /etc/udev/rules.d/10-wOCE.rules

clean:
	rm -fr $(target) *.map build/* *.mp4 /tmp/$(target)cast* *.orig */*.orig html
	make -C toolbox clean

doxygen:
	doxygen Doxyfile


################################################################# COMMON RULES


-include $(deps)

vpath %.o build
vpath % $(dirs)


build/%.o : %.cc makefile build/objdir
	@echo " CC $@"
	@$(CC) $(CCOPTS) -c -o $@ $<

build/%.o : %.c makefile build/objdir
	@echo " CC $@"
	@${CC} $(COPTS) -c -o $@ $<

build/%.o : %.glsl makefile build/objdir
	@echo " OBJCOPY $@"
	@objcopy -I binary -O elf64-x86-64 -B i386 $< $@

build/%.d : %.cc build/objdir
	@echo " CPP $@"
	@echo -n build/ > $@
	@$(CPP) $(CCOPTS) -MM $< >> $@

build/%.d : %.c build/objdir
	@echo " CPP $@"
	@echo -n build/ > $@
	@$(CPP) $(COPTS) -MM $< >> $@

build/objdir:
	find $(srcpath) -type d | xargs -I DIR mkdir -p build/DIR
	touch build/objdir
